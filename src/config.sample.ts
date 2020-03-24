import * as fs from 'fs';
export default {
    https: {
        options: {
            key: fs.readFileSync('privkey.pem', 'utf8'),
            cert: fs.readFileSync('cert.pem', 'utf8'),
            ca: fs.readFileSync('chain.pem', 'utf8')
        }
    },
    auth: { user: 'pass' },
    google_home_device: { device: '', ip: '192.168.1.1', lang: 'en-US' },
    udp: { ip: '192.168.1.255', port: 5000 },
    dryRun: false,
    miIOT: {
        ip: '192.168.1.2',
        token: ''
    }
};
