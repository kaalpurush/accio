import * as dgram from 'dgram';

class Udp {
    private config: any;

    constructor(config: any) {
        this.config = config;
    }

    public broadcast(msg: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const message = new Buffer(msg);

            const client = dgram.createSocket('udp4');
            client.bind();
            client.on('listening', () => {
                client.setBroadcast(true);
                client.send(message, 0, message.length,
                    this.config.port, this.config.ip, (err) => {
                        if (err) { return reject(); }
                        console.log('UDP message sent to ' +
                            this.config.ip + ':' + this.config.port);
                        client.close();
                        resolve();
                    });
            });
        });
    }
}
export { Udp };
