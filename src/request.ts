export function callApi(client, options, body = ''): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = client.request(options, (res) => {
            console.log(options.path, res.statusCode);
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        }).on('error', (error) => {
            console.error(options.path, error);
            reject();
        });

        if (options.method !== 'GET') {
            req.write(body);
        }
        req.end();
    });
}