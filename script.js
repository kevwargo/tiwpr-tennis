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
    },

    onScore: function(result) {
        if (result) {
            $('#game-result').text('You won! :)').attr('class', 'won');
        } else {
            $('#game-result').text('You lost... :(').attr('class', 'lost');
        }
        $('#replay').css('display', 'table');
        Playground.stop();
    }

};

var Playground = {
    ballSize: 30,
    refreshInterval: 40,

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
        var self = this;
        var draw = function() {
            self.clear();
            self.left.draw(self.context);
            self.right.draw(self.context);
            self.drawBall();
        };
        draw();
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(draw, this.refreshInterval);
        // setInterval(function() {
        //     WS.send('ball', self.ball);
        // }, 1000);
    },

    drawBall: function() {
        var ball = this.ball;

        this.context.beginPath();
        this.context.arc(ball.pos.x, ball.pos.y, this.ballSize, 0, 2 * Math.PI);
        this.context.fillStyle = 'green';
        this.context.fill();

        ball.pos.x += Math.cos(Math.PI * (ball.angle / 180)) * (ball.speed * this.refreshInterval / 1000);
        ball.pos.y += Math.sin(Math.PI * (ball.angle / 180)) * (ball.speed * this.refreshInterval / 1000);

        if (ball.pos.x <= this.ballSize) {
            WS.send('score', 'right');
            this.stop();
        } else if (ball.pos.x >= this.canvas.width - this.ballSize) {
            WS.send('score', 'left');
            this.stop();
        } else {
            if (ball.pos.y <= this.ballSize) {
                ball.angle = (270 - ball.angle + 270 + 180) % 360;
                if (ball.angle < 0) {
                    ball.angle += 360;
                }
            } else if (ball.pos.y >= this.canvas.height - this.ballSize) {
                ball.angle = (90 - ball.angle + 90 + 180) % 360;
                if (ball.angle < 0) {
                    ball.angle += 360;
                }
            }
        }
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
        default:
            return;
        }
        event.preventDefault();
        WS.send('pos', Playground[side].y);
    });

    $('#replay-button').click(function() {
        window.location.reload(true);
    });
}


$(function() {
    var session = findSession();
    if (session) {
        initSession(session);
    }
    WS.init(session);
});
