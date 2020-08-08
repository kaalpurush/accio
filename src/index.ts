import * as express from 'express';
// import * as basicAuth from 'express-basic-auth';
import * as http from 'http';
import * as https from 'https';
import * as bodyParser from 'body-parser';
import { dialogflow, Parameters, DialogflowConversation, BasicCard, SimpleResponse } from 'actions-on-google';
import * as child_process from 'child_process';
import * as dgram from 'dgram';
const exec = child_process.exec;
import { GoogleHomeNotifier } from '@shooontan/google-home-notifier';
import miio = require('miio');

import config from './config';

let airDevice: any;

const SUCCESS_MSG = 'Done sir!';
const FAIL_MSG = 'Sorry, failed!';
const ANYTHING_ELSE_MSG = 'Anything else, sir?';
const SUCCESS_JSON = { code: 200, message: 'success' };

const assistant = dialogflow();

const app = express();

app.set('port', process.env.PORT || 443);
app.use(bodyParser.json({ type: 'application/json' }));

// app.use(basicAuth({
//     users: config.auth
// }));

assistant.intent('control', (conv) => {
    console.log(conv.query);
    console.log(conv.parameters);

    conv.add('Carrying out command: ' + conv.query);

    return processAssistantIntent(conv);
});

app.get('/', (req: express.Request, res: express.Response) => {
    const out = { code: 200, message: 'hello world!' };
    res.json(out);
});

app.post('/webhook', assistant);

app.get('/motion', (req: express.Request, res: express.Response) => {
    if (req.query.id) {
        const devices = ['lab room'];
        const id = req.query.id;
        if (devices[id] !== undefined) {
            castMessage('motion in ' + devices[id])
                .then(() => {
                    res.json(SUCCESS_JSON);
                }).catch(() => {
                    res.json({ code: 400, message: 'network error!' });
                });
        } else {
            res.json({ code: 400, message: 'invalid param value!' });
        }

    } else {
        res.json({ code: 400, message: 'param missing!' });
    }
});


app.get('/weather', (req: express.Request, res: express.Response) => {
    if (req.query.t && req.query.h) {
        castMessage('temparature: ' + req.query.t + ' degree celcius, humidity: ' + req.query.h + '%')
            .then(() => {
                res.json(SUCCESS_JSON);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else {
        res.json({ code: 400, message: 'param missing!' });
    }
});

app.get('/kommand', (req: express.Request, res: express.Response) => {
    const params = { device: req.query.device, state: req.query.state };

    if (params.device && params.state) {
        execCommand(params)
            .then((r) => res.json(r ? r : SUCCESS_JSON))
            .catch((e) => {
                res.json({ code: 400, message: 'error!', error: e });
            });
    } else {
        res.status(404).end();
    }
});

app.all('/broadcast', (req: express.Request, res: express.Response) => {
    const msg = req.query.msg ? req.query.msg : req.body.msg;

    const url = req.query.url ? req.query.url : req.body.url;

    if (msg) {
        castMessage(msg)
            .then(() => {
                res.json(SUCCESS_JSON);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else if (url) {
        castURL(url)
            .then(() => {
                res.json(SUCCESS_JSON);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else {
        res.json({ code: 400, message: 'param missing!' });
    }

});

app.get('/web-push', (req: express.Request, res: express.Response) => {
    res.sendFile('public/web-push.html', { root: __dirname + '/../' });
});

app.post('/web-push', (req: express.Request, res: express.Response) => {
    assignPushTokenToTopic(req.body.token, 'kommand');
    res.json(SUCCESS_JSON);
});

app.use(express.static('public'));

const httpsServer = https.createServer(config.https.options, app);
httpsServer.listen(app.get('port'), () => {
    console.log('https server started on port', app.get('port'));
});

const httpServer = http.createServer(app);
httpServer.listen(80, () => {
    console.log('http server started on port', 80);
});

function assignPushTokenToTopic(token: string, topic: string) {
    const options = {
        hostname: 'iid.googleapis.com',
        port: 443,
        path: '/iid/v1/' + token + '/rel/topics/' + topic,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': config.firebaseServerKey
        }
    };

    const req = https.request(options, (res) => {
        console.log(`assignToTopic:statusCode: ${res.statusCode}`);
    });

    req.on('error', (error) => {
        console.error(error);
    });

    req.write('');
    req.end();
}

function sendPush(title: string, body: string, collapse_key: string = 'kommand') {
    const options = {
        hostname: 'fcm.googleapis.com',
        port: 443,
        path: '/fcm/send',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': config.firebaseServerKey
        }
    };

    const req = https.request(options, (res) => {
        console.log(`sendPush:statusCode: ${res.statusCode}`);
    });

    req.on('error', (error) => {
        console.error(error);
    });

    const jsonBody = {
        to: '/topics/kommand',
        notification: {
            title,
            body,
            icon: 'https://image.flaticon.com/icons/png/128/2004/2004705.png',
            click_action: config.baseUrl
        },
        collapse_key,
        time_to_live: 300
    };

    req.write(JSON.stringify(jsonBody));
    req.end();
}

interface IDeviceData {
    status: boolean;
    temperature: number;
    humidity: number;
    pm2_5: number;
}

function getAirStatus() {
    return new Promise<IDeviceData>((resolve, reject) => {
        miio
            .device({ address: config.miIOT.ip, token: config.miIOT.token })
            .then((device: any) => {
                addAirEventHandler(device);
                return Promise.all(
                    [
                        device.power(),
                        device.temperature(),
                        device.relativeHumidity(),
                        device.pm2_5()
                    ]
                );
            })
            .then(([s, t, h, p]) => {
                resolve({ status: s, temperature: t.celsius, humidity: h, pm2_5: p });
            })
            .catch((err: any) => reject(err));
    });
}

function addAirEventHandler(device: any) {
    if (airDevice == null) {
        airDevice = device;
        // airDevice.on('power', (power: boolean) => {
        //     sendPush('Kommand', 'Purifier State: ' + (power === true ? 'On' : 'Off'));
        // });
        airDevice.on('pm2.5Changed', (pm2_5: number) => {
            sendPush('Kommand', 'Purifier PM2.5: ' + pm2_5, 'purifier');
        });
    }
}

function processAssistantIntent(conv: DialogflowConversation<any, any, any>) {
    if (conv.parameters.device === 'purifier' && conv.parameters.state === 'status') {
        return execCommand(conv.parameters)
            .then((r: IDeviceData) => {
                const text = `
                Temparature: ${r.temperature.toFixed(1)} °C
                Humidity: ${r.humidity}%
                Air Quality: ${r.pm2_5}
                Air Purifier: ${r.status === true ? 'On' : 'Off'}
                `;
                conv.ask(text
                    // new SimpleResponse({ speech: text, text: '' }),
                    // new BasicCard({
                    //     title: 'Purifier Status',
                    //     text,

                    // })
                );
            })
            .catch((e) => {
                console.error(e);
                conv.ask(FAIL_MSG);
            });
    } else {
        return execCommand(conv.parameters)
            .then(() => conv.ask(SUCCESS_MSG))
            .catch(() => conv.ask(FAIL_MSG));
    }
}

function broadcastCommand(params: Parameters) {
    const command = `${params.location} ${params.device} ${params.state}`;
    sendPush('Kommand', command);
    broadcastUDP(command);
}

function execCommand(params: Parameters): Promise<any> {
    return new Promise<IDeviceData>((resolve, reject) => {

        broadcastCommand(params);

        if (params.device === 'tv' && params.state === 'off') {
            const cmd = 'sh ' + __dirname + '/shield-shutdown.sh';
            console.log('cmd', cmd);
            exec(cmd,
                (error) => {
                    if (error) {
                        reject();
                    }
                    resolve();
                });
        } else if (params.device === 'purifier') {
            if (params.state === 'status') {
                getAirStatus()
                    .then((r) => resolve(r))
                    .catch(() => reject());
            } else {
                miio
                    .device({ address: config.miIOT.ip, token: config.miIOT.token })
                    .then((device: any) => device.setPower(params.state === 'on'))
                    .then(() => resolve())
                    .catch(() => reject());
            }
        } else {
            resolve();
        }
    });
}

function castMessage(msg: string): Promise<void> {
    return new Promise((resolve, reject) => {

        if (config.dryRun) {
            return resolve();
        }

        const notifier = new GoogleHomeNotifier(config.google_home_device);
        notifier.say(msg)
            .then(() => {
                resolve();
            }).catch(() => {
                reject();
            });
    });
}

function castURL(url: string): Promise<void> {
    return new Promise((resolve, reject) => {

        if (config.dryRun) {
            return resolve();
        }

        const notifier = new GoogleHomeNotifier(config.google_home_device);
        notifier.play(url)
            .then(() => {
                resolve();
            }).catch(() => {
                reject();
            });
    });
}

function broadcastUDP(msg: string) {
    const message = new Buffer(msg);

    const client = dgram.createSocket('udp4');
    client.bind();
    client.on('listening', () => {
        client.setBroadcast(true);
        client.send(message, 0, message.length, config.udp.port, config.udp.ip, (err) => {
            if (err) { throw err; }
            console.log('UDP message sent to ' + config.udp.ip + ':' + config.udp.port);
            client.close();
        });
    });

}
