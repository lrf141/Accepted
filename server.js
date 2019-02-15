const Http = require('http');
const Redis = require('ioredis');
const Url = require('url');
const Fs = require('fs');
const Docker = require('dockerode');
const Colors = require('colors/safe');


// redis config
const redisConfig = require('./redis-config.json');
const redis = new Redis(redisConfig);
const sub = new Redis(redisConfig);
const pub = new Redis(redisConfig);

// start redis subscribe channel
sub.subscribe('waiting-queue-event', 'processing-queue-event', (err, count) => {
	// no event
	if(err)
		console.log(err+':'+count);
});

// server config
const proxyPort = process.env.ACCEPTED_PORT || 9001;


// http condfig
const defaultHeader = require('./default-http-header.json');


const getFromClient = (request, response) => {

	let urlParts = Url.parse(request.url, true);
	switch(urlParts.pathname){
    
	case '':
	case '/':
		response.writeHead(200, defaultHeader);
		response.end(JSON.stringify({'status': 'success'}));
		break;

	case '/add':
		if (request.method === 'POST') {
                
			let data = '';
                
			request.on('data', (chunk) => {
				data += chunk;
			});

			request.on('end', () => {
				console.log('hello');
				const jsonData = JSON.parse(data);
				if (jsonData.xid && jsonData.code) {
					Fs.writeFileSync('./examples/' + jsonData.xid + '.py', jsonData.code);
                        
					// TODO:add error handler
					pub.pipeline().publish('waiting-queue-event', JSON.stringify({'event': 'add', 'id': jsonData.xid})).exec();
					redis.pipeline().rpush('waitQueue', jsonData.xid).exec();
                        
					//response.writeHead(200, defaultHeader);
					response.end(JSON.stringify({'status': 'success'}));
				} else {
					response.writeHead(400, defaultHeader);
					response.end(JSON.stringify({'status': 'bad request.'}));
				}
			});
		} else {
			response.writeHead(405, defaultHeader);
			response.end(JSON.stringify({'status': 'Method Not Allowed.'}));
		}
		break;

	default:
		response.writeHead(404, defaultHeader);
		response.end(JSON.stringify({'status': 'not found'}));
		break;
	}
};

// launch proxy server
const server = Http.createServer(getFromClient);
server.listen(proxyPort);


// print server status
console.log('Accepted-Proxy running on ' + proxyPort + ' with node: ' + process.version + ' pid: ' + process.pid + ' ... ' + Colors.green('[OK]'));
console.log('Redis connect ... ' + Colors.green('[OK]'));
console.log('Redis subscribe connect ... ' + Colors.green('[OK]'));
console.log('Redis publish connect ... ' + Colors.green('[OK]'));
console.log('To shutdown, press <CTRL>+C at any time.');
