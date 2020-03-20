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

// app.use(basicAuth({
//     users: config.auth
// }));

assistant.intent('control', conv => {
    console.log(conv.parameters);
    console.log(conv.query);
    conv.add(`Immediately sir! \n`);
    conv.close('Carrying out command:' + conv.query);
    processCommand(conv.query, conv.parameters);
    broadcast(conv.parameters.location + " " + conv.parameters.device + " " + conv.parameters.state);
});

app.get('/', (req, res) => {
    let out = { code: 200, message: 'hello world!' };
    res.json(out);
});

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

app.get('/air/status', (req, res) => {
    getAirStatus(req, res, req.query.broadcast)
});

function getAirStatus(req, res, broadcast) {
    let out = { code: 200, message: 'success' };
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
            res && res.json({ status: s, temperature: t, humidity: h, pm2_5: p });
            if (broadcast)
                castMessage(
                    `
                        temparature: ${t.celsius.toFixed(2)} °C,
                        humidity: ${h}%,
                        air quality: ${p},
                        air purifier: ${s == true ? 'on' : 'off'}
                        `
                )
        })
        .catch(err => res && res.json(err));
}

app.get('/air/:command', (req, res) => {
    let out = { code: 200, message: 'success' };
    miio
        .device({ address: config.miIOT.ip, token: config.miIOT.token })
        .then(device => { return runAirCommand(device, req.params.command) })
        .then(() => res.json(out))
        .catch(err => res.json(err));
});

function runAirCommand(device, command) {
    if (command == 'on' || command == 'off')
        return device.setPower(command == 'on')
}


app.post('/webhook', assistant);

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

function processCommand(command, params) {
    if (command.toLowerCase().indexOf('tv') >= 0) {
        let cmd = 'sh ' + __dirname + '/shield-shutdown.sh';
        console.log('cmd', cmd);
        exec(cmd,
            (error, stdout, stderr) => {
                if (error)
                    console.error(error);
                console.log(stdout);
                if (error)
                    console.error(stderr);
            });
    } else if (params.device == 'purifier') {
        params.state == 'status' ? getAirStatus(null, null, true) :
            miio
                .device({ address: config.miIOT.ip, token: config.miIOT.token })
                .then(device => device.setPower(params.state == 'on'))
                .then(() => { })
                .catch(err => { });
    }
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

function broadcast(msg) {
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
