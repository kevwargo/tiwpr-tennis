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
        left.side = 'left'
        right.side = 'right'
        self.left = left
        self.right = right
        left.game = self
        right.game = self

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

    def initialize(self, manager):
        self.manager = manager
        self.pos = 165

    def write_json(self, type, data):
        self.write_message(json.dumps({'type': type, 'data': data}).encode('utf-8'))

    def write_pos(self):
        self.write_json('pos', {
            self.side: self.pos,
            self.other_side: self.opponent.pos
        })

    def throw_error(self, message, code=500):
        self.write_json('error', {'code': code, 'msg': message})
        self.close()

    def init_session(self):
        self.session = self.manager.generate_session_id()
        self.manager.players[self.session] = self
        self.write_json('session', self.session)

    def init_game(self):
        self.write_json('game', {'id': str(self.game), 'side': self.side})

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

    def open(self, session=None, **kwargs):
        print('New ws connection: ' + str(session))
        if session:
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
                getattr(self, handler)(message['data'])
        except (ValueError, KeyError):
            pass

    def on_close(self):
        print('Player {} closed the connection'.format(self))
        if self == self.manager.waitingPlayer:
            self.manager.waitingPlayer = None

    def onPos(self, pos):
        self.pos = pos
        self.write_pos()
        self.opponent.write_pos()


class Manager:

    def __init__(self):
        self.games = set()
        self.players = {}
        self.waitingPlayer = None
        self.rangen = random.SystemRandom()

    def generate_session_id(self):
        return b64.b32encode(bytes(self.rangen.randint(0, 255) for _ in range(5))).decode('utf-8')

    def connect_to_session(self, session, player):
        if session in self.players:
            if self.players[session].ws_connection is None:
                print('replacing player in session ' + session)
                old = self.players[session]
                old.game.update_player(player, session)
                self.players[session] = player
                player.pos = old.pos
                player.init_game()
                player.write_pos()
            else:
                print('session {} is taken'.format(session))
                player.throw_error('Session is taken')
        else:
            player.throw_error('No such session', 404)

    def create_new_game(self, player):
        game = Game(self.waitingPlayer, player)
        self.games.add(game)
        self.waitingPlayer.init_session()
        player.init_session()
        self.waitingPlayer.init_game()
        player.init_game()
        self.waitingPlayer.write_pos()
        player.write_pos()
        print('New {}'.format(game))
        self.waitingPlayer = None

    def player_wait(self, player):
        print('New waiting player')
        self.waitingPlayer = player


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
