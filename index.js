const express = require('express');
const basicAuth = require('express-basic-auth')
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const { dialogflow } = require('actions-on-google');
const exec = require('child_process').exec;

var dgram = require('dgram');

var config = require('./config');

const GoogleHomeNotifier = require('@shooontan/google-home-notifier');

const miio = require('miio');

const assistant = dialogflow();

const app = express();

app.set('port', process.env.PORT || 443);
app.use(bodyParser.json({ type: 'application/json' }));

const SUCCESS_MSG = 'done sir!';
const FAIL_MSG = 'sorry, failed!';

// app.use(basicAuth({
//     users: config.auth
// }));

assistant.intent('control', conv => {
    console.log(conv.parameters);
    console.log(conv.query);

    conv.add('carrying out command:' + conv.query);

    udpBroadcast(conv.parameters.location + " " + conv.parameters.device + " " + conv.parameters.state);

    return processAssistantIntent(conv);
});

app.get('/', (req, res) => {
    let out = { code: 200, message: 'hello world!' };
    res.json(out);
});

app.post('/webhook', assistant);

app.get('/motion', (req, res) => {
    console.log('motion', req.query);
    if (req.query.id) {
        let devices = ["lab room"];
        let out = { code: 200, message: 'success' };
        let id = req.query.id;
        if (devices[id] !== undefined) {
            castMessage('motion in ' + devices[id])
                .then(() => {
                    res.json(out);
                }).catch(e => {
                    res.json({ code: 400, message: 'network error!' });
                });
        } else {
            res.json({ code: 400, message: 'invalid param value!' });
        }

    } else {
        res.json({ code: 400, message: 'param missing!' });
    }
});


app.get('/weather', (req, res) => {
    console.log('weather', req.query);
    if (req.query.t && req.query.h) {
        let out = { code: 200, message: 'success' };
        castMessage("temparature: " + req.query.t + " degree celcius, humidity: " + req.query.h + "%")
            .then(() => {
                res.json(out);
            }).catch(e => {
                res.json({ code: 400, message: 'network error!' });
            });
    } else {
        res.json({ code: 400, message: 'param missing!' });
    }
});

app.get('/kommand', (req, res) => {
    let out = { code: 200, message: 'success' };
    const params = { device: req.query.device, state: req.query.state };

    if (params.device && params.state)
        execCommand(params)
            .then(r => res.json(r ? r : out))
            .catch(e => {
                res.json({ code: 400, message: 'error!' });
            });
    else
        res.status(404).end()
});

app.all('/broadcast', (req, res) => {
    let out = { code: 200, message: 'success' };

    let msg = req.query.msg ? req.query.msg : req.body.msg;

    let url = req.query.url ? req.query.url : req.body.url;

    if (msg)
        castMessage(msg)
            .then(() => {
                res.json(out);
            }).catch(e => {
                res.json({ code: 400, message: 'network error!' });
            });
    else if (url)
        castURL(url)
            .then(() => {
                res.json(out);
            }).catch(e => {
                res.json({ code: 400, message: 'network error!' });
            });
    else
        res.json({ code: 400, message: 'param missing!' });

});

const httpsServer = https.createServer(config.https.options, app);
httpsServer.listen(app.get('port'), () => {
    console.log('Express server started on port', app.get('port'));
});

const httpServer = http.createServer(app);
httpServer.listen(80, () => {
    console.log('Express server started on port', 80);
});

function getAirStatus() {
    return new Promise((resolve, reject) => {
        miio
            .device({ address: config.miIOT.ip, token: config.miIOT.token })
            .then(device => Promise.all(
                [
                    device.power(),
                    device.temperature(),
                    device.relativeHumidity(),
                    device.pm2_5()
                ]
            ))
            .then(([s, t, h, p]) => {
                resolve({ status: s, temperature: parseFloat(t.celsius.toFixed(2)), humidity: h, pm2_5: p })
            })
            .catch(err => reject(err));
    });
}

function processAssistantIntent(conv) {
    if (conv.parameters.device == 'purifier' && conv.parameters.state == 'status') {
        return execCommand(conv.parameters)
            .then(r => {
                conv.close(
                    `
                    temparature: ${r.temperature} °C,
                    humidity: ${r.humidity}%,
                    air quality: ${r.pm2_5},
                    air purifier: ${r.status == true ? 'on' : 'off'}
                    `
                )
            });
    } else {
        return execCommand(conv.parameters)
            .then(r => conv.close(SUCCESS_MSG))
            .catch(e => conv.close(FAIL_MSG));
    }
}

function execCommand(params) {
    return new Promise((resolve, reject) => {
        if (params.device == 'tv') {
            let cmd = 'sh ' + __dirname + '/shield-shutdown.sh';
            console.log('cmd', cmd);
            exec(cmd,
                (error, stdout, stderr) => {
                    if (error)
                        reject()
                    resolve();
                });
        } else if (params.device == 'purifier') {
            if (params.state == 'status') {
                getAirStatus()
                    .then(r => resolve(r))
                    .catch(e => reject());
            } else {
                miio
                    .device({ address: config.miIOT.ip, token: config.miIOT.token })
                    .then(device => device.setPower(params.state == 'on'))
                    .then(r => resolve())
                    .catch(e => reject());
            }
        } else {
            reject();
        }
    });
}

function castMessage(msg) {
    return new Promise((resolve, reject) => {

        if (config.dryRun) {
            console.log('casting: ' + msg);
            return resolve();
        }

        const notifier = GoogleHomeNotifier(config.google_home_device);
        notifier.say(msg)
            .then(() => {
                resolve();
            }).catch(e => {
                reject();
            });
    });
}

function castURL(url) {
    return new Promise((resolve, reject) => {

        if (config.dryRun) {
            console.log('casting: ' + url);
            return resolve();
        }

        const notifier = GoogleHomeNotifier(config.google_home_device);
        notifier.play(url)
            .then(() => {
                resolve();
            }).catch(e => {
                reject();
            });
    });
}

function udpBroadcast(msg) {
    var message = new Buffer(msg);

    var client = dgram.createSocket('udp4');
    client.bind();
    client.on('listening', () => {
        client.setBroadcast(true);
        client.send(message, 0, message.length, config.udp.port, config.udp.ip, (err, bytes) => {
            if (err) throw err;
            console.log('UDP message sent to ' + config.udp.ip + ':' + config.udp.port);
            client.close();
        });
    });

}
