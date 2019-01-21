const IO = require('socket.io');

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
