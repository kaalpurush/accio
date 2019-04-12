const express = require('express');
const basicAuth = require('express-basic-auth')
const https = require('https');
const bodyParser = require('body-parser');
const { dialogflow } = require('actions-on-google');

var dgram = require('dgram');

var config = require('./config');

const GoogleHomeNotifier = require('@shooontan/google-home-notifier');

const assistant = dialogflow();

const app = express();

app.set('port', process.env.PORT || 443);
app.use(bodyParser.json({ type: 'application/json' }));

// app.use(basicAuth({
//     users: config.auth
// }));

assistant.intent('control', conv => {
    console.log(conv.parameters);
    conv.add(`Immediately sir! \n`);
    conv.close('Carrying out command:' + conv.query);
    broadcast(conv.query);
});

app.get('/', (req, res) => {
    res.send('hello world!');
});

app.post('/webhook', assistant);

app.get('/broadcast', (req, res) => {
	if(req.query.msg)
    castMessage(req.query.msg)
        .then(() => {
            res.send('success');
        });
    else if(req.query.url)
    castURL(req.query.url)
        .then(() => {
            res.send('success');
        });
     else
           res.send('param missing');
});

const server = https.createServer(config.https.options, app);
server.listen(app.get('port'), () => {
    console.log('Express server started on port', app.get('port'));
});

function castMessage(msg) {
    return new Promise((resolve, reject) => {
        const notifier = GoogleHomeNotifier(config.google_home_device);
        notifier.say(msg)
            .then(() => {
                resolve();
            })
            .catch((e) => {
                reject(e);
            });
    });
}

function castURL(url) {
    return new Promise((resolve, reject) => {
        const notifier = GoogleHomeNotifier(config.google_home_device);
        notifier.play(url)
            .then(() => {
                resolve();
            })
            .catch((e) => {
                reject(e);
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
