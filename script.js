var WsMessageHandler = {

    onError: function(err) {
        htmlLog(renderjson.set_show_to_level('all')(err));
    },

    handleBinary: function(data) {
        var dataView = new DataView(data);
        var bytes = [];
        for (var i = 0; i < data.byteLength; i++) {
            bytes.push([dataView.getInt8(i), dataView.getUint8(i)]);
        }
        htmlLog(JSON.stringify(bytes));
    },

    onSession: function(session) {
        initSession(session);
    },

    onGame: function(game) {
        htmlLog('WS: Game: ' + game.id);
        $('#shadow').hide();
        Playground.init(game.side);
        Playground.start();
    },

};

var Playground = {
    playerWidth: 30,
    playerHeight: 150,

    init: function(side) {
        this.canvas = document.getElementById('playground');
        this.canvas.width = 640;
        this.canvas.height = 480;
        this.context = this.canvas.getContext('2d');
        this.left = new Player('left');
        this.right = new Player('right');
        initEvents(side);
    },

    start: function() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(this.draw, 40);
    },

    clear: function() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    draw: function() {
        var ctx = Playground.context,
            left = Playground.left,
            right = Playground.right;
        Playground.clear();
        ctx.fillStyle = 'blue';
        ctx.fillRect(left.x, left.y, Playground.playerWidth, Playground.playerHeight);
        ctx.fillStyle = 'red';
        ctx.fillRect(right.x, right.y, Playground.playerWidth, Playground.playerHeight);
    },

    stop: function() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }
};

function Player(side) {
    this.side = side;
    if (side === 'left') {
        this.x = 0;
    } else if (side === 'right') {
        this.x = Playground.canvas.width - 30;
    }
    this.y = 165;
}


function htmlLog(message) {
    $('#log').append($('<pre>').html(message).css('margin', '3px').css('border', '1px dotted blue'));
    window.scrollTo(0, document.body.scrollHeight);
}

function findSession() {
    var session = null;
    matches = location.search.match(/[?&]session=([A-Z0-9]+)(&|$)/);
    if (matches && matches[1]) {
        session = matches[1];
        sessionStorage.session = session;
        console.log('Session id `' + session + '` extracted from URL query');
    } else {
        session = sessionStorage.session;
        if (session) {
            console.log('Session id `' + session + '` extracted from sessionStorage');
        }
    }
    return session;
}

function initSession(session) {
    document.title = session;
    sessionStorage.session = session;
    htmlLog('WS: Session saved: ' + session);
}

function initWS(session) {
    var ws = new WebSocket('ws://' + location.host + "/ws" + (session ? '/' + session : ''));
    ws.binaryType = 'arraybuffer';
    ws.onopen = function(event) {
        htmlLog('ws opened');
    };
    ws.onmessage = function(event) {
        if (typeof event.data === 'string') {
            var msg = JSON.parse(event.data);
            var type = msg.type;
            if (type) {
                var method = 'on' + type.charAt(0).toUpperCase() + type.slice(1);
                if (typeof WsMessageHandler[method] === 'function') {
                    WsMessageHandler[method](msg.data);
                }
            }
        } else {
            WsMessageHandler.handleBinary(event.data);
        }
    };
}

function initEvents(side) {
    $(document).keydown(function(event) {
        switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            Playground[side].y -= 3;
            break;
        case 'ArrowDown':
            event.preventDefault();
            Playground[side].y += 3;
            break;
        }
    });
}


$(function() {
    var session = findSession();
    if (session) {
        initSession(session);
    }
    initWS(session);
});
