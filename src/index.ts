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
import * as schedule from 'node-schedule';

import config from './config';

import { Push } from './push';
import * as request from './request';

let airDevice: any;
let motionSensor = false;

const SUCCESS_MSG = 'Done sir!';
const FAIL_MSG = 'Sorry, failed!';
const ANYTHING_ELSE_MSG = 'Anything else, sir?';
const SUCCESS_JSON = { code: 200, message: 'success' };
const FAIL_JSON = { code: 500, message: 'error' };

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
    // console.log('motion detected!');
    if (!motionSensor) {
        return res.json({ code: 400, message: 'sensor disabled!' });
    }

    if (req.query.id) {
        const devices = config.motionSensorName;
        const id = req.query.id;
        if (devices[id] !== undefined) {
            castMessage('motion in ' + devices[id])
                .then(() => {
                    return new Push(config).send('Motion Trigger', 'motion in ' + devices[id]);
                }).then(() => {
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
                res.status(500).json({ code: 500, message: 'error!', error: e });
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
    new Push(config).assignTokenToTopic(req.body.token, 'kommand')
        .then((r) => {
            res.json(SUCCESS_JSON);
        }).catch((e) => {
            res.status(500).json(FAIL_JSON);
        });
});

app.get('/dash', (req: express.Request, res: express.Response) => {
    res.sendFile('public/dashboard.html', { root: __dirname + '/../' });
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
            new Push(config).send('Purifier Status', 'PM2.5: ' + pm2_5, 'purifier');
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
    }

    if (conv.parameters.device === 'energy' && conv.parameters.state === 'status') {
        return execCommand(conv.parameters)
            .then((r: any) => {
                const text = `
                Usage: ${parseInt(r.data.CurrentConsumptions.amount, 10)} on ${r.data.CurrentConsumptions.date},
                Balance: ${parseInt(r.data.RemainingBalances.amount, 10)} on ${r.data.RemainingBalances.date}
                `;
                conv.ask(text);
            })
            .catch((e) => {
                console.error(e);
                conv.ask(FAIL_MSG);
            });
    }

    if (conv.parameters.device === 'mobile' && conv.parameters.state === 'status') {
        return execCommand(conv.parameters)
            .then((r: any) => {
                const text = `
                Balance: ${r.balance},
                Internet: ${r.internet.value},
                Voice: ${r.voice.value},
                SMS: ${r.sms.value}
                `;
                conv.ask(text);
            })
            .catch((e) => {
                console.error(e);
                conv.ask(FAIL_MSG);
            });
    }

    return execCommand(conv.parameters)
        .then(() => conv.ask(SUCCESS_MSG))
        .catch(() => conv.ask(FAIL_MSG));

}

function broadcastCommand(params: Parameters) {
    const command = `${params.location} ${params.device} ${params.state}`;
    if (params.state !== 'status') {
        new Push(config).send('Kommand', command);
    }
    broadcastUDP(command);
}

function execCommand(params: Parameters): Promise<IDeviceData | any> {
    return new Promise<IDeviceData | any>((resolve, reject) => {

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
        } else if (params.device === 'motion') {
            motionSensor = params.state === 'on';
            resolve();
        } else if (params.device === 'energy') {
            request.callApi(http, config.energyApi.options)
                .then((r) => resolve(r))
                .catch(() => reject());
        } else if (params.device === 'mobile') {
            getMobileApiResponse()
                .then((r) => resolve(r))
                .catch(() => reject());
        } else {
            resolve();
        }
    });
}

function getMobileApiResponse(): Promise<any> {
    return new Promise((resolve, reject) => {
        request.callApi(https, config.mobileBalanceApi.options)
            .then((b) => {
                if (b.type === 'prepaid') {
                    resolve(b);
                } else {
                    return Promise.all([b, request.callApi(https, config.mobileUsageApi.options)]);
                }
            }).then(([b, u]: any) => {
                b.balance = u.available_balance;
                resolve(b);
            })
            .catch(() => reject());
    });
}

function castMessage(msg: string): Promise<void> {
    return new Promise((resolve, reject) => {

        if (config.dryRun) {
            return resolve();
        }

        const notifier = new GoogleHomeNotifier(config.googleHome);
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

        const notifier = new GoogleHomeNotifier(config.googleHome);
        notifier.play(url)
            .then(() => {
                resolve();
            }).catch(() => {
                reject();
            });
    });
}

function broadcastUDP(msg: string): Promise<void> {
    return new Promise((resolve, reject) => {

        const message = new Buffer(msg);

        const client = dgram.createSocket('udp4');
        client.bind();
        client.on('listening', () => {
            client.setBroadcast(true);
            client.send(message, 0, message.length, config.udp.port, config.udp.ip, (err) => {
                if (err) { return reject(); }
                console.log('UDP message sent to ' + config.udp.ip + ':' + config.udp.port);
                client.close();
                resolve();
            });
        });
    });
}

function initSchedulers() {
    schedule.scheduleJob('0 10 * * *', () => {
        request.callApi(http, config.energyApi.options)
            .then((r) => {
                return new Push(config).send('Energy Status',
                    `Remaining: ${r.data.RemainingBalances.amount} BDT`);
            })
            .then(() => {
                console.log('Job Success!');
            })
            .catch(() => {
                console.log('Job Failed!');
            });
    });
}

function init() {
    motionSensor = config.motionSensor;
    initSchedulers();
}

init();
