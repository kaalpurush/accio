import { GoogleHomeNotifier } from '@shooontan/google-home-notifier';

class Cast {
    private config: any;

    constructor(config: any) {
        this.config = config;
    }

    public sendMessage(msg: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const notifier = new GoogleHomeNotifier(this.config);
            notifier.say(msg)
                .then(() => {
                    resolve();
                }).catch(() => {
                    reject();
                });
        });
    }

    public sendURL(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const notifier = new GoogleHomeNotifier(this.config);
            notifier.play(url)
                .then(() => {
                    resolve();
                }).catch(() => {
                    reject();
                });
        });
    }
}
export { Cast };
