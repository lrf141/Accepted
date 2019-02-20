const Redis = require('ioredis');
const Docker = require('dockerode');
const Stream = require('stream');
const IO = require('socket.io');
const Fs = require('fs');
const Request = require('request');

//socket.io init
const io = IO.listen(8000);
let store = {};
io.on('connection', (socket) => {
	console.log('connect');
	socket.on('register', (msg) => {
		const usrobj = {
			'xid': msg.xid
		};
		store[msg.xid] = usrobj;
		socket.join(msg.xid);
		console.log('connection accept');
		console.log('xid: ' + msg.xid);
		console.log(store);
	});

	socket.on('process-message', (msg) => {
		io.to(store[msg.xid].xid).emit('process-message', msg.body);
	});
});

//Docker init
const docker = new Docker({
	socketPath: '/var/run/docker.sock'
});

//redis init
const redisConfig = require('./redis-config.json');
const redis = new Redis(redisConfig);
const sub = new Redis(redisConfig);
const pub = new Redis(redisConfig);

let waiting = 0;
let processing = 0;
const maxProcessing = 4;

//start redus subscribe
sub.subscribe('waiting-queue-event', 'processing-queue-event', 'next-process-event', (err, count) => {
	if (err) {
		console.log(err+':'+count);
	}
});

sub.on('message', (channel, message) => {
   
	console.log('Receive %s, %s', channel, message); 
	switch (channel) {
	case 'waiting-queue-event':
		waiting += 1;

		if (processing < maxProcessing) {
			waiting -= 1;
			redis.pipeline().lpop('waitQueue').exec().then((result) => {
			    pub.publish('processing-queue-event', result[0][1]);
				console.log(result[0]);
			});
		}
		break;

	case 'processing-queue-event':
		//create and run container
		docker.createContainer({
			Image: 'gw000/keras-full',
			Cmd: ['python', '/src/'+message+'.py'],
			'Volumes': {
				'/src': {}
			},
			'HostConfig': {
				'Binds': [ __dirname+'/examples:/src']
			},
			'DefaultRuntime': 'nvidia'
		}, (err, container) => {
			console.log(err);
			container.start({}, (err, data) => {
				containerLogs(container, message);
			});
		});

		processing += 1;
		break;
        
	case 'next-process-event':

		processing -= 1;
		redis.pipeline().lpop('waitQueue').exec().then((result) => {
			if (result[0][1] != null) {
				pub.publish('processing-queue-event', result[0][1]);
			}
		});
		break;
	}
});

const containerLogs = (container, transaction) => {
	
    console.log('docker container xid:' + transaction);

    let loss = null;
    let val_loss = null;
	
    const logStream = new Stream.PassThrough();
	logStream.on('data', (chunk) => {
		//add websocket function
		io.emit('process-message', {
			xid: transaction,
			body: chunk.toString('utf8')
		});
		console.log(chunk.toString('utf8'));

        if (chunk.toString('utf8').match(/gb_loss:/)) {
            loss = chunk.toString('utf8').split(':')[1];
        }

        if (chunk.toString('utf8').match(/gb_val_loss:/)) {
            val_loss = chunk.toString('utf8').split(':')[1];
        }
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
			//and add process next step from waiting queue
            Fs.unlink('examples/'+transaction+'.py', (err) => {
                if (err) 
                    console.log(err);
            });
			pub.publish('next-process-event', 'next process start');
			logStream.end('process finish');

            const options = {
                url: 'http://localhost/api/data',
                method: 'POST',
                json: true,
                headers: {
                    'Content-Type':'application/json'
                },
                form: {
                    'xid': transaction,
                    'loss': loss,
                    'val_loss': val_loss
                }
            }

            Request(options, (error, response, body) => {
                console.log(body);
                console.log(error)
            });
		});
	});
};
