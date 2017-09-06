#!/usr/bin/env python3

import sys
import json
import random
import base64 as b64
from tornado import web, websocket, ioloop


class SessionHandler(web.RequestHandler):

    def get(self, session):
        if session:
            self.redirect('/index.html?session=' + session)
        else:
            self.redirect('/index.html')


class Game:

    def __init__(self, left, right):
        self.left = left
        self.right = right
        left.game = self
        right.game = self
        left.opponent = right
        right.opponent = left

    def __str__(self):
        return 'Game {}:{}'.format(self.left, self.right)

    def update_player(self, player):
        if str(player) == str(self.left):
            self.left = player
            self.right.opponent = player
            player.game = self
            print('replaced left')
        elif str(player) == str(self.right):
            self.right = player
            self.left.opponent = player
            player.game = self
            print('replaced right')
        else:
            print('replaced nothing')


class Player(websocket.WebSocketHandler):

    def initialize(self, manager):
        self.manager = manager

    def write_json(self, type, data):
        self.write_message(json.dumps({'type': type, 'data': data}).encode('utf-8'))

    def throw_error(self, message, code=500):
        self.write_json('error', {'code': code, 'msg': message})
        self.close()

    def init_session(self):
        self.session = self.manager.generate_session_id()
        self.manager.players[self.session] = self
        self.write_json('session', self.session)

    def __str__(self):
        if hasattr(self, 'session'):
            return self.session
        else:
            return websocket.WebSocketHandler.__str__(self)

    def open(self, session=None, **kwargs):
        print('New ws connection: ' + str(session))
        if session:
            session = session.upper()
            if session in self.manager.players:
                if self.manager.players[session].ws_connection is None:
                    print('replacing player in session ' + session)
                    self.session = session
                    self.manager.players[session].game.update_player(self)
                    self.manager.players[session] = self
                    self.write_json('game', str(self.game))
                else:
                    print('session {} is taken'.format(session))
                    self.throw_error('Session is taken')
            else:
                self.throw_error('No such session', 404)
        elif self.manager.waitingPlayer:
            game = Game(self.manager.waitingPlayer, self)
            self.manager.games.add(game)
            self.manager.waitingPlayer.init_session()
            self.init_session()
            self.manager.waitingPlayer.write_json('game', str(game))
            self.write_json('game', str(game))
            print('New {}'.format(game))
            self.manager.waitingPlayer = None
        else:
            print('New waiting player')
            self.manager.waitingPlayer = self

    def on_close(self):
        print('Player {} closed the connection'.format(self))
        if self == self.manager.waitingPlayer:
            self.manager.waitingPlayer = None


class Manager:

    def __init__(self):
        self.games = set()
        self.players = {}
        self.waitingPlayer = None
        self.rangen = random.SystemRandom()

    def generate_session_id(self):
        return b64.b32encode(bytes(self.rangen.randint(0, 255) for _ in range(5))).decode('utf-8')


def main(port):
    app = web.Application([
        (r'/(index\.html|script\.js|style\.css|renderjson\.js)', web.StaticFileHandler, {'path': '.'}),
        (r'/([A-Z0-9]+)?', SessionHandler),
        (r'/ws(?P<slash>/(?P<session>[A-Za-z0-9]+))?', Player, {'manager': Manager()})
    ])
    app.listen(port)
    ioloop.IOLoop.instance().start()

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 5080)
