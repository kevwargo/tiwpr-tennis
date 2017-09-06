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
        sessionStorage.session = session;
        document.title = session;
        htmlLog('WS: Session saved: ' + session);
    },

    onGame: function(game) {
        htmlLog('WS: Game: ' + game);
    },

};


function htmlLog(message) {
    $('#log').append($('<pre>').html(message).css('margin', '3px').css('border', '1px dotted blue'));
    window.scrollTo(0, document.body.scrollHeight);
}

function initSession() {
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
    if (session) {
        document.title = session;
    }
    return session;
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


$(function() {
    initWS(initSession());
});
