const fs = require('fs');

module.exports = {
    https: {
        options : {
            key: fs.readFileSync('./privkey.pem', 'utf8'),
            cert: fs.readFileSync('./cert.pem', 'utf8'),
            ca: fs.readFileSync('./chain.pem', 'utf8')
        }
    },
    auth: { 'test': 'test' },
    google_home_device: { device: 'Google Home', ip: '192.168.1.2', lang: 'en-US' },
    udp: {ip: '192.168.1.255', port: 5000}
}