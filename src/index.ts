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

const SUCCESS_MSG = 'Done sir!';
const FAIL_MSG = 'Sorry, failed!';

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

    broadcastUDP(`${conv.parameters.location} ${conv.parameters.device} ${conv.parameters.state}`);

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
        const out = { code: 200, message: 'success' };
        const id = req.query.id;
        if (devices[id] !== undefined) {
            castMessage('motion in ' + devices[id])
                .then(() => {
                    res.json(out);
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
        const out = { code: 200, message: 'success' };
        castMessage('temparature: ' + req.query.t + ' degree celcius, humidity: ' + req.query.h + '%')
            .then(() => {
                res.json(out);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else {
        res.json({ code: 400, message: 'param missing!' });
    }
});

app.get('/kommand', (req: express.Request, res: express.Response) => {
    const out = { code: 200, message: 'success' };
    const params = { device: req.query.device, state: req.query.state };

    if (params.device && params.state) {
        execCommand(params)
            .then((r) => res.json(r ? r : out))
            .catch(() => {
                res.json({ code: 400, message: 'error!' });
            });
    } else {
        res.status(404).end();
    }
});

app.all('/broadcast', (req: express.Request, res: express.Response) => {
    const out = { code: 200, message: 'success' };

    const msg = req.query.msg ? req.query.msg : req.body.msg;

    const url = req.query.url ? req.query.url : req.body.url;

    if (msg) {
        castMessage(msg)
            .then(() => {
                res.json(out);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else if (url) {
        castURL(url)
            .then(() => {
                res.json(out);
            }).catch(() => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else {
        res.json({ code: 400, message: 'param missing!' });
    }

});

const httpsServer = https.createServer(config.https.options, app);
httpsServer.listen(app.get('port'), () => {
    console.log('Express server started on port', app.get('port'));
});

const httpServer = http.createServer(app);
httpServer.listen(80, () => {
    console.log('Express server started on port', 80);
});

interface IDeviceData {
    status: boolean;
    temperature: any;
    humidity: number;
    pm2_5: number;
}

function getAirStatus() {
    return new Promise<IDeviceData>((resolve, reject) => {
        miio
            .device({ address: config.miIOT.ip, token: config.miIOT.token })
            .then((device: any) => Promise.all(
                [
                    device.power(),
                    device.temperature(),
                    device.relativeHumidity(),
                    device.pm2_5()
                ]
            ))
            .then(([s, t, h, p]) => {
                resolve({ status: s, temperature: t, humidity: h, pm2_5: p });
            })
            .catch((err: any) => reject(err));
    });
}

function processAssistantIntent(conv: DialogflowConversation<any, any, any>) {
    if (conv.parameters.device === 'purifier' && conv.parameters.state === 'status') {
        return execCommand(conv.parameters)
            .then((r: IDeviceData) => {
                const text = `
                Temparature: ${r.temperature} °C
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
            });
    } else {
        return execCommand(conv.parameters)
            .then(() => conv.ask(SUCCESS_MSG))
            .catch(() => conv.ask(FAIL_MSG));
    }
}

function execCommand(params: Parameters): Promise<any> {
    return new Promise<IDeviceData>((resolve, reject) => {
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
            reject();
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
