const Redis = require('ioredis');
const Docker = require('dockerode');
const Stream = require('stream');
const IO = require('socket.io');

//socket.io init
const io = IO.listen(8000);
let store = {};
io.on('connection', (socket) => {
    socket.on('join', (msg) => {
        usrobj = {
            'xid': msg.xid
        };
        store[msg.xid] = usrobj;
        socket.join(msg.xid);
    });

    socket.on('process message', (msg) => {
        io.to(store[msg.xid].xid).emit('process message', msg.body);
    });
});

//Docker init
const docker = new Docker({
	socketPath: '/var/run/docker.sock'
});

//redis init
const redisConfig = require('./redis-config.json');
const queueConfig = require('./redis-queue-config.json');
const redis = new Redis(redisConfig);
const sub = new Redis(redisConfig);
const pub = new Redis(redisConfig);

let waiting = 0;
let processing = 0;
const maxProcessing = 4;

//start redus subscribe
sub.subscribe('waiting-queue-event', 'processing-queue-event', (err, count) => {
	if (err) {
		console.log(err);
	}
});

sub.on('message', (channel, message) => {
    
	switch (channel) {
	case 'waiting-queue-event':
		waiting += 1;
		if (processing < maxProcessing) {
			waiting -= 1;
			const nextTask = redis.pipline.lpop('waitQueue');
			pub.publish('processing-queue-event', nextTask);
		}
		break;

	case 'processing-queue-event':

		//create and run container
		docker.createContainer({
			//Image: '',
			//Cmd: ['python', message]
			Image: 'ubuntu',
			Cmd: ['/bin/bash', '-c', 'yes "hello"']
		}, (err, container) => {
			container.start({}, (err, data) => {
				containerLogs(container);
			});
		});

		processing += 1;
		break;
	}
});

const containerLogs = (container) => {
	const logStream = new Stream.PassThrough();
	logStream.on('data', (chunk) => {
		//add websocket function
		console.log(chunk.toString('utf8'));
	});

	container.logs({
		follow: true,
		stdout: true,
		stderr: true
	}, (err, stream) => {
		if(err) {
			console.log(err);
		}
		container.modem.demuxStream(stream, logStream, logStream);
		stream.on('end', () => {
			//add websocket function
            //and add process next step from waiting queue
			console.log('stop');
			logStream.end('!stop!');    
		});
	});
};