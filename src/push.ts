import * as https from 'https';
import * as request from './request';

class Push {
    private config: any;

    constructor(config: any) {
        this.config = config;
    }

    public assignTokenToTopic(token: string, topic: string) {
        const options = {
            hostname: 'iid.googleapis.com',
            port: 443,
            path: '/iid/v1/' + token + '/rel/topics/' + topic,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.config.firebaseServerKey
            }
        };

        return request.callApi(https, options);
    }

    public send(title: string, body: string, collapse_key: string = 'kommand'): Promise<void> {
        const options = {
            hostname: 'fcm.googleapis.com',
            port: 443,
            path: '/fcm/send',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.config.firebaseServerKey
            }
        };

        const jsonBody = {
            to: '/topics/kommand',
            notification: {
                title: title + ' - ' + this.config.appName,
                body,
                icon: 'https://image.flaticon.com/icons/png/128/2004/2004705.png',
                click_action: this.config.baseUrl + '/dash'
            },
            collapse_key,
            time_to_live: 300
        };
        return request.callApi(https, options, JSON.stringify(jsonBody));
    }
}

export {Push};
