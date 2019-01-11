const Http = require('http');
const Redis = require('ioredis');
const Url = require('url');
const Query = require('querystring');
const Fs = require('fs');
const Tmp = require('tmp');
const Docker = require('dockerode');
const Colors = require('colors/safe');


// redis config
const redisConfig = require('./redis-config.json');
const queueConfig = require('./redis-queue-config.json');
const redis = new Redis(redisConfig);
const sub = new Redis(redisConfig);
const pub = new Redis(redisConfig);

//docker config
const docker = new Docker({socketPath: '/var/run/docker.sock'});

// start redis subscribe channel
sub.subscribe('waiting-queue-event', 'processing-queue-event', (err, count) => {
	// no event
    if(err)
        console.log(err);
});

// server config
const proxyPort = process.env.ACCEPTED_PORT || 9000;


// http condfig
const defaultHeader = require('./default-http-header.json');


// docker container status api
const getDockerContainerLists = async () => {
    return await docker.listContainers({"filters":{"name":["learning"]}});
};

const getFromClient = async (request, response) => {

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
				const jsonData = JSON.parse(data);
				if (jsonData.xid && jsonData.code) {
					Fs.writeFileSync('./examples/' + jsonData.xid + '.py', jsonData.code);
                        
					// TODO:add error handler
					pub.pipeline().publish('waiting-queue-event', JSON.stringify({'event': 'add', 'id': jsonData.xid).exec();
					redis.pipeline().rpush('waitQueue', jsonData.xid+'.py').exec();
                        
					response.writeHead(200, defaultHeader);
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

    case '/containers':
        if (request.method === 'GET') {
            const containersJson = await getDockerContainerLists();
            response.writeHead(200, defaultHeader);
            response.end(JSON.stringify(containersJson));
        } else {
            response.writeHead(405, defaultHeader);
            response.end(JSON.stringify({'status': 'Method Not Allowed.'}));
        }
        break;

    case '/status':
        if (request.method === 'GET'){
            response.writeHead(200, defaultHeader);
            response.end(JSON.stringify({'status': 'success'})); 
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
