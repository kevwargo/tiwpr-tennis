var WS = {

    init: function(session) {
        this.ws = new WebSocket('ws://' + location.host + "/ws" + (session ? '/' + session : ''));
        this.ws.binaryType = 'arraybuffer';
        this.ws.onopen = function(event) {
            // htmlLog('WS opened');
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
        // htmlLog(renderjson.set_show_to_level('all')(err));
    },

    handleBinary: function(data) {
        var dataView = new DataView(data);
        var bytes = [];
        for (var i = 0; i < data.byteLength; i++) {
            bytes.push([dataView.getInt8(i), dataView.getUint8(i)]);
        }
        // htmlLog(JSON.stringify(bytes));
    },

    onSession: function(session) {
        initSession(session);
    },

    onGame: function(game) {
        // htmlLog('WS: ' + game.id);
        $('#shadow').hide();
        Playground.init(game);
        Playground.start();
    },

    onPos: function(pos) {
        Playground.left.y = pos.left;
        Playground.right.y = pos.right;
    },

    onBall: function(ball) {
        Playground.ball = ball;
    },

    onScore: function(result) {
        // htmlLog(JSON.stringify(Playground.ball));
        if (result) {
            $('#game-result').text('You won! :)').attr('class', 'won');
        } else {
            $('#game-result').text('You lost... :(').attr('class', 'lost');
        }
        $('#replay').css('display', 'table');
        Playground.stop();
        window.sessionStorage.removeItem('session');
    }

};

var Playground = {
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
        setInterval(function() {
            WS.send('ball', self.ball);
        }, 1000);
    },

    drawBall: function() {
        var ball = this.ball;

        this.context.beginPath();
        this.context.arc(ball.pos.x, ball.pos.y, ball.size, 0, 2 * Math.PI);
        this.context.fillStyle = 'green';
        this.context.fill();

        ball.pos.x += ball.speed.x * this.refreshInterval / 1000;
        ball.pos.y += ball.speed.y * this.refreshInterval / 1000;

        if (ball.pos.x <= ball.size) {
            WS.send('score', 'right');
            this.stop();
        } else if (ball.pos.x >= this.canvas.width - ball.size) {
            WS.send('score', 'left');
            this.stop();
        } else {
            if (ball.pos.y <= ball.size && this.bounce !== 'top') {
                ball.speed.y = -ball.speed.y;
                this.bounce = 'top';
            } else if (ball.pos.y >= this.canvas.height - ball.size && this.bounce !== 'bottom') {
                ball.speed.y = -ball.speed.y;
                this.bounce = 'bottom';
            } else {
                for (var p in {left: 0, right: 1}) {
                    var collision = this[p].collides(ball);
                    if (typeof collision === 'object') {
                        var dx = ball.speed.x,
                            dy = ball.speed.y,
                            dist = this.dist(collision[0], collision[1], ball.pos.x, ball.pos.y),
                            nx = (ball.pos.x - collision[0]) / dist,
                            ny = (ball.pos.y - collision[1]) / dist,
                            product = nx*dx + ny*dy;

                        htmlLog("Old: " + JSON.stringify(ball.speed));
                        ball.speed.x = dx - 2*product*nx;
                        ball.speed.y = dy - 2*product*ny;
                        htmlLog("New: " + JSON.stringify(ball.speed));
                        this.bounce = null;
                    } else if (typeof collision === 'number') {
                        ball.speed.x = -ball.speed.x;
                        this.bounce = null;
                    }
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
    },

    dist: function(x1, y1, x2, y2) {
        var sqr = function(x) { return x*x; };
        return Math.sqrt(sqr(x1-x2) + sqr(y1-y2));
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

    this.collides = function(ball) {
        var upCenterY = this.y - this.height/2 + this.width;
        var downCenterY = this.y + this.height/2 - this.width;
        var coords = [
            [-this.xTranslate, upCenterY],
            [-this.xTranslate, downCenterY]
        ];
        for (var i in coords) {
            if (Playground.dist(coords[i][0], coords[i][1], ball.pos.x, ball.pos.y) < ball.size + this.width) {
                htmlLog(JSON.stringify(coords[i]));
                return coords[i];
            }
        }
        if (this.xScale * ball.pos.x < this.xTranslate + this.width + ball.size
            && ball.pos.y <= downCenterY && ball.pos.y >= upCenterY) {
            return Math.abs(this.xTranslate + this.width + ball.size);
        }
    }
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
        window.sessionStorage.session = session;
        console.log('Session id `' + session + '` extracted from URL query');
    } else {
        session = window.sessionStorage.session;
        if (session) {
            console.log('Session id `' + session + '` extracted from sessionStorage');
        }
    }
    return session;
}

function initSession(session) {
    document.title = session;
    window.sessionStorage.session = session;
    // htmlLog('WS: Session saved: ' + session);
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
            // htmlLog('reset sent');
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

    window.setInterval(function() {
        $('#ball-pos').text(JSON.stringify(Playground.ball.pos));
    }, 1500);
}


$(function() {
    var session = findSession();
    if (session) {
        initSession(session);
    }
    WS.init(session);
});
