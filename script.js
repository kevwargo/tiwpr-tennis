var WS = {

    init: function(session) {
        this.ws = new WebSocket('ws://' + location.host + "/ws" + (session ? '/' + session : ''));
        this.ws.binaryType = 'arraybuffer';
        this.ws.onopen = function(event) {
            htmlLog('WS opened');
        };
        this.ws.onmessage = function(event) {
            if (typeof event.data === 'string') {
                var msg = JSON.parse(event.data);
                var type = msg.type;
                if (type) {
                    var method = 'on' + type.charAt(0).toUpperCase() + type.slice(1);
                    if (typeof WS[method] === 'function') {
                        WS[method](msg.data);
                    }
                }
            } else {
                WS.handleBinary(event.data);
            }
        };
    },

    send: function(type, data) {
        this.ws.send(JSON.stringify({
            type: type,
            data: data
        }));
    },

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
        Playground.init(game);
        Playground.start();
        htmlLog('Angle: ' + game.ball.angle);
    },

    onPos: function(pos) {
        Playground.left.y = pos.left;
        Playground.right.y = pos.right;
    },

    onBall: function(ball) {
        Playground.ball = ball;
        htmlLog(JSON.stringify(ball));
    }

};

var Playground = {
    ballSize: 30,

    init: function(game) {
        this.canvas = document.getElementById('playground');
        this.canvas.width = 640;
        this.canvas.height = 480;
        this.context = this.canvas.getContext('2d');
        this.left = new Player('left');
        this.right = new Player('right');
        this.ball = game.ball;
        initEvents(game.side);
    },

    start: function() {
        var refreshInterval = 40;
        var counter = 0;
        var draw = function() {
            var ctx = Playground.context,
                left = Playground.left,
                right = Playground.right,
                ball = Playground.ball;

            counter++;

            Playground.clear();
            left.draw(ctx);
            right.draw(ctx);

            ctx.beginPath();
            ctx.arc(ball.pos.x, ball.pos.y, Playground.ballSize, 0, 2 * Math.PI);
            ctx.fillStyle = 'green';
            ctx.fill();

            ball.pos.x += Math.cos(Math.PI * (ball.angle / 180)) * (ball.speed * refreshInterval / 1000);
            ball.pos.y += Math.sin(Math.PI * (ball.angle / 180)) * (ball.speed * refreshInterval / 1000);

        };
        draw();
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(draw, refreshInterval);
        setInterval(function() {
            WS.send('ball', Playground.ball);
        }, 1000);
    },

    clear: function() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
    this.width = 30;
    this.height = 150;
    this.y = Playground.canvas.height / 2;
    if (side === 'left') {
        this.color = 'blue';
        this.xScale = 1;
        this.xTranslate = 0;
    } else {
        this.color = 'red';
        this.xScale = -1;
        this.xTranslate = -Playground.canvas.width;
    }

    this.move = function(step) {
        this.y += step;
    };

    this.draw = function(ctx) {
        var y = this.y - this.height / 2;

        ctx.fillStyle = this.color;

        ctx.scale(this.xScale, 1);
        ctx.translate(this.xTranslate, 0);

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.arcTo(this.width, y, this.width, y + this.width, this.width);
        ctx.lineTo(this.width, y + this.height - this.width);
        ctx.arcTo(this.width, y + this.height, 0, y + this.height, this.width);
        ctx.fill();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
}


function htmlLog(message, id) {
    $('#log').prepend($('<pre class="message">').html(message));
    window.scrollTo(0, 0);
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

function initEvents(side) {
    $(document).keydown(function(event) {
        switch (event.key) {
        case 'ArrowUp':
            Playground[side].move(-5);
            break;
        case 'ArrowDown':
            Playground[side].move(5);
            break;
        case 'R':
            WS.send('reset');
            htmlLog('reset sent');
            return;
        case 'w':
            Playground.ball.pos.y -= 1;
            break;
        case 'a':
            Playground.ball.pos.x -= 1;
            break;
        case 's':
            Playground.ball.pos.y += 1;
            break;
        case 'd':
            Playground.ball.pos.x += 1;
            break;
        case 'W':
            Playground.ball.pos.y -= 10;
            break;
        case 'A':
            Playground.ball.pos.x -= 10;
            break;
        case 'S':
            Playground.ball.pos.y += 10;
            break;
        case 'D':
            Playground.ball.pos.x += 10;
            break;
        case '=':
            Playground[side].rotate += 1;
            break;
        case '-':
            Playground[side].rotate -= 1;
            break;
        default:
            return;
        }
        event.preventDefault();
        WS.send('pos', Playground[side].y);
    });
}


$(function() {
    var session = findSession();
    if (session) {
        initSession(session);
    }
    WS.init(session);
});
