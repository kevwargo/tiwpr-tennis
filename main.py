#!/usr/bin/env python3

import sys
import json
import random
import base64 as b64
import math
from tornado import web, websocket, ioloop


class SessionHandler(web.RequestHandler):

    def initialize(self, manager):
        self.manager = manager

    def get(self, session):
        if session and session in self.manager.players:
            self.redirect('/index.html?session=' + session)
        else:
            self.redirect('/index.html')


class Game:

    def __init__(self, left, right, manager):
        self.manager = manager
        left.side = 'left'
        right.side = 'right'
        self.left = left
        self.right = right
        self.coordinator = left
        left.game = self
        right.game = self
        self.reset()

    def __str__(self):
        return 'Game {}:{}'.format(self.left, self.right)

    def reset(self):
        angle = self.manager.random_angle()
        speed = 30
        self.ball = {
            'size': 20,
            'pos': {'x': 320, 'y': 240},
            'speed': {'x': speed * math.cos(angle), 'y': speed * math.sin(angle)}
        }
        self.left.pos = 240;
        self.right.pos = 240;

    def update_player(self, player, session):
        if session == str(self.left):
            self.left = player
            player.side = 'left'
            print('replaced left')
        elif session == str(self.right):
            self.right = player
            player.side = 'right'
            print('replaced right')
        else:
            print('replaced nothing')
            return
        player.game = self
        player.session = session


class Player(websocket.WebSocketHandler):

    def __str__(self):
        if hasattr(self, 'session'):
            return self.session
        else:
            return websocket.WebSocketHandler.__str__(self)

    def __getattribute__(self, attr):
        if attr != 'game' and hasattr(self, 'game'):
            if attr == 'other_side':
                l = ['left', 'right']
                return l[not l.index(self.side)]
            if attr == 'opponent':
                return getattr(self.game, self.other_side)
        return object.__getattribute__(self, attr)

    def initialize(self, manager):
        self.manager = manager
        self.pos = 240

    def send_json(self, type, data=None):
        self.write_message(json.dumps({'type': type, 'data': data}).encode('utf-8'))

    def send_pos(self):
        self.send_json('pos', {
            self.side: self.pos,
            self.other_side: self.opponent.pos
        })

    def throw_error(self, message, code=500):
        self.send_json('error', {'code': code, 'msg': message})
        self.close()

    def init_session(self):
        self.session = self.manager.generate_session_id()
        self.manager.players[self.session] = self
        self.send_json('session', self.session)

    def send_game(self):
        self.send_json('game', {
            'id': str(self.game),
            'side': self.side,
            'ball': self.game.ball
        })

    def send_ball(self):
        self.send_json('ball', self.game.ball)

    def send_score(self, side):
        if self.side == side:
            self.send_json('score', True)
        else:
            self.send_json('score', False)

    def open(self, session=None, **kwargs):
        print('New ws connection: ' + str(session))
        if session and session.upper() in self.manager.players:
            self.manager.connect_to_session(session.upper(), self)
        elif self.manager.waitingPlayer:
            self.manager.create_new_game(self)
        else:
            self.manager.player_wait(self)

    def on_message(self, message):
        try:
            message = json.loads(message)
            type = message['type']
            handler = 'on' + type[0].upper() + type[1:]
            if callable(getattr(self, handler)):
                getattr(self, handler)(message.get('data'))
            else:
                print('No handler ' + handler)
        except (ValueError, KeyError):
            pass

    def on_close(self):
        if hasattr(self, 'game'):
            self.game.coordinator = self.opponent
        if hasattr(self, 'session'):
            print('Player {} disconnected'.format(self.session))
        if self == self.manager.waitingPlayer:
            self.manager.waitingPlayer = None

    def onPos(self, pos):
        self.pos = pos
        self.send_pos()
        try:
            self.opponent.send_pos()
        except websocket.WebSocketClosedError:
            pass

    def onReset(self, *args):
        self.game.reset()
        self.send_ball()
        try:
            self.opponent.send_ball()
        except websocket.WebSocketClosedError:
            pass

    def onBall(self, ball):
        if self.game.coordinator == self:
            self.game.ball = ball
            try:
                self.opponent.send_ball()
            except websocket.WebSocketClosedError:
                pass

    def onScore(self, side):
        self.send_score(side)
        try:
            self.opponent.send_score(side)
        except websocket.WebSocketClosedError:
            pass
        self.manager.players.pop(self.session, None)
        self.close()

class Manager:

    def __init__(self):
        self.games = set()
        self.players = {}
        self.waitingPlayer = None
        self.rangen = random.SystemRandom()

    def generate_session_id(self):
        return b64.b32encode(bytes(self.rangen.randint(0, 255) for _ in range(5))).decode('utf-8')

    def connect_to_session(self, session, player):
        if self.players[session].ws_connection is None:
            print('replacing player in session ' + session)
            old = self.players[session]
            old.game.update_player(player, session)
            self.players[session] = player
            player.pos = old.pos
            player.send_game()
            player.send_pos()
        else:
            print('session {} is taken'.format(session))
            player.throw_error('Session is taken')

    def create_new_game(self, player):
        game = Game(self.waitingPlayer, player, self)
        self.games.add(game)
        self.waitingPlayer.init_session()
        player.init_session()
        self.waitingPlayer.send_game()
        player.send_game()
        self.waitingPlayer.send_pos()
        player.send_pos()
        print('New {}'.format(game))
        self.waitingPlayer = None

    def player_wait(self, player):
        print('New waiting player')
        self.waitingPlayer = player

    def random_angle(self):
        return math.pi * (self.rangen.randint(10, 80) + self.rangen.choice([0, 90, 180, 270])) / 180


def main(port):
    app = web.Application([
        (r'/(index\.html|script\.js|style\.css|renderjson\.js)', web.StaticFileHandler, {'path': '.'}),
        (r'/([A-Z0-9]+)?', SessionHandler, {'manager': Manager()}),
        (r'/ws(?P<slash>/(?P<session>[A-Za-z0-9]+))?', Player, {'manager': Manager()})
    ])
    app.listen(port)
    ioloop.IOLoop.instance().start()

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 5080)
