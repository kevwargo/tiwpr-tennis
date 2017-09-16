#!/usr/bin/env python3

import sys
import json
import random
import base64 as b64
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

    def __init__(self, left, right):
        left.side = 'left'
        right.side = 'right'
        self.left = left
        self.right = right
        left.game = self
        right.game = self
        self.ball = {
            'pos': {'x': 320, 'y': 240},
            'speed': 70.0, # pixels per second
            'angle': left.manager.random_angle()
        }

    def __str__(self):
        return 'Game {}:{}'.format(self.left, self.right)

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

    def send_json(self, type, data):
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
        print('Player {} closed the connection'.format(self))
        if self == self.manager.waitingPlayer:
            self.manager.waitingPlayer = None

    def onPos(self, pos):
        self.pos = pos
        self.send_pos()
        self.opponent.send_pos()

    def onReset(self, *args):
        self.game.ball = {
            'pos': {'x': 320, 'y': 240},
            'speed': 70.0,
            'angle': self.manager.random_angle()
        }
        self.send_ball()
        self.opponent.send_ball()

    def onBall(self, ball):
        print('{} ball: {}'.format(self, ball))
        self.game.ball = ball
        self.send_ball()
        self.opponent.send_ball()


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
        game = Game(self.waitingPlayer, player)
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
        return self.rangen.randint(0, 50) + self.rangen.choice([20, 110, 200, 290])


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
