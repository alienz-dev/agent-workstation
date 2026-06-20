"""Daemon HTTP server and main entry point."""
import asyncio
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web
import click


class DaemonState:
    """SQLite-backed state for the daemon."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema."""
        conn = sqlite3.connect(self.db_path)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'initializing',
                adapter TEXT NOT NULL DEFAULT 'kiro',
                task TEXT NOT NULL,
                parent_id TEXT,
                spawn_config TEXT,
                result_path TEXT,
                result_status TEXT,
                started_at INTEGER NOT NULL,
                finished_at INTEGER,
                last_heartbeat INTEGER,
                pane_id TEXT,
                session_name TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
            CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
            CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_name);
            
            CREATE TABLE IF NOT EXISTS file_claims (
                path TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                claimed_at INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                from_agent TEXT,
                to_role TEXT,
                to_agent TEXT,
                content TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                delivered_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
            
            CREATE TABLE IF NOT EXISTS pipeline_state (
                session_name TEXT PRIMARY KEY,
                current_stage TEXT NOT NULL DEFAULT 'plan',
                updated_at INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT,
                agent_id TEXT,
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            
            CREATE TABLE IF NOT EXISTS spawn_rate (
                minute_key TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 0
            );
        """)
        conn.commit()
        conn.close()
    
    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)
    
    def register_agent(self, agent_id: str, role: str, task: str, session_name: str,
                       adapter: str = 'kiro', parent_id: str = None,
                       spawn_config: dict = None, pane_id: str = None):
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO agents (id, role, status, adapter, task, parent_id, spawn_config,
                                started_at, last_heartbeat, pane_id, session_name)
            VALUES (?, ?, 'initializing', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (agent_id, role, adapter, task, parent_id,
              json.dumps(spawn_config) if spawn_config else None,
              int(time.time()), int(time.time()), pane_id, session_name))
        conn.commit()
        conn.close()
    
    def update_agent_status(self, agent_id: str, status: str, result_status: str = None):
        conn = self._get_conn()
        if status in ('terminated', 'failed'):
            conn.execute("""
                UPDATE agents SET status = ?, result_status = ?, finished_at = ?
                WHERE id = ?
            """, (status, result_status, int(time.time()), agent_id))
        else:
            conn.execute("UPDATE agents SET status = ?, last_heartbeat = ? WHERE id = ?",
                        (status, int(time.time()), agent_id))
        conn.commit()
        conn.close()
    
    def heartbeat(self, agent_id: str):
        conn = self._get_conn()
        conn.execute("UPDATE agents SET last_heartbeat = ? WHERE id = ?",
                    (int(time.time()), agent_id))
        conn.commit()
        conn.close()
    
    def get_agent(self, agent_id: str) -> dict | None:
        conn = self._get_conn()
        cursor = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            cols = ['id', 'role', 'status', 'adapter', 'task', 'parent_id', 'spawn_config',
                    'result_path', 'result_status', 'started_at', 'finished_at',
                    'last_heartbeat', 'pane_id', 'session_name']
            return dict(zip(cols, row))
        return None
    
    def list_agents(self, session_name: str = None) -> list[dict]:
        conn = self._get_conn()
        if session_name:
            cursor = conn.execute("SELECT * FROM agents WHERE session_name = ?", (session_name,))
        else:
            cursor = conn.execute("SELECT * FROM agents")
        rows = cursor.fetchall()
        conn.close()
        cols = ['id', 'role', 'status', 'adapter', 'task', 'parent_id', 'spawn_config',
                'result_path', 'result_status', 'started_at', 'finished_at',
                'last_heartbeat', 'pane_id', 'session_name']
        return [dict(zip(cols, row)) for row in rows]
    
    def claim_file(self, path: str, agent_id: str) -> bool:
        conn = self._get_conn()
        try:
            conn.execute("INSERT INTO file_claims (path, agent_id, claimed_at) VALUES (?, ?, ?)",
                        (path, agent_id, int(time.time())))
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            conn.close()
            return False
    
    def release_file(self, path: str):
        conn = self._get_conn()
        conn.execute("DELETE FROM file_claims WHERE path = ?", (path,))
        conn.commit()
        conn.close()
    
    def list_claims(self, agent_id: str = None) -> list[dict]:
        conn = self._get_conn()
        if agent_id:
            cursor = conn.execute("SELECT * FROM file_claims WHERE agent_id = ?", (agent_id,))
        else:
            cursor = conn.execute("SELECT * FROM file_claims")
        rows = cursor.fetchall()
        conn.close()
        return [{'path': r[0], 'agent_id': r[1], 'claimed_at': r[2]} for r in rows]
    
    def queue_message(self, msg_id: str, content: str, from_agent: str = None,
                      to_role: str = None, to_agent: str = None):
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO messages (id, from_agent, to_role, to_agent, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (msg_id, from_agent, to_role, to_agent, content, int(time.time())))
        conn.commit()
        conn.close()
    
    def get_pending_messages(self, to_agent: str = None, to_role: str = None) -> list[dict]:
        conn = self._get_conn()
        if to_agent:
            cursor = conn.execute("SELECT * FROM messages WHERE to_agent = ? AND status = 'pending'",
                                 (to_agent,))
        elif to_role:
            cursor = conn.execute("SELECT * FROM messages WHERE to_role = ? AND status = 'pending'",
                                 (to_role,))
        else:
            cursor = conn.execute("SELECT * FROM messages WHERE status = 'pending'")
        rows = cursor.fetchall()
        conn.close()
        cols = ['id', 'from_agent', 'to_role', 'to_agent', 'content', 'status', 'created_at', 'delivered_at']
        return [dict(zip(cols, row)) for row in rows]
    
    def mark_message_delivered(self, msg_id: str):
        conn = self._get_conn()
        conn.execute("UPDATE messages SET status = 'delivered', delivered_at = ? WHERE id = ?",
                    (int(time.time()), msg_id))
        conn.commit()
        conn.close()
    
    def get_pipeline_stage(self, session_name: str) -> str:
        conn = self._get_conn()
        cursor = conn.execute("SELECT current_stage FROM pipeline_state WHERE session_name = ?",
                             (session_name,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else 'plan'
    
    def set_pipeline_stage(self, session_name: str, stage: str):
        conn = self._get_conn()
        conn.execute("""
            INSERT OR REPLACE INTO pipeline_state (session_name, current_stage, updated_at)
            VALUES (?, ?, ?)
        """, (session_name, stage, int(time.time())))
        conn.commit()
        conn.close()
    
    def log_event(self, event_type: str, payload: dict = None, agent_id: str = None):
        conn = self._get_conn()
        conn.execute("INSERT INTO events (type, payload, agent_id, timestamp) VALUES (?, ?, ?, ?)",
                    (event_type, json.dumps(payload) if payload else None, agent_id, int(time.time())))
        conn.commit()
        conn.close()
    
    def check_rate_limit(self, limit_per_minute: int = 5) -> bool:
        minute_key = str(int(time.time() // 60))
        conn = self._get_conn()
        cursor = conn.execute("SELECT count FROM spawn_rate WHERE minute_key = ?", (minute_key,))
        row = cursor.fetchone()
        if row and row[0] >= limit_per_minute:
            conn.close()
            return False
        if row:
            conn.execute("UPDATE spawn_rate SET count = count + 1 WHERE minute_key = ?", (minute_key,))
        else:
            conn.execute("INSERT INTO spawn_rate (minute_key, count) VALUES (?, 1)", (minute_key,))
        conn.commit()
        conn.close()
        return True
    
    def count_children(self, parent_id: str) -> int:
        conn = self._get_conn()
        cursor = conn.execute("SELECT COUNT(*) FROM agents WHERE parent_id = ? AND status NOT IN ('terminated', 'failed')",
                             (parent_id,))
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
    def detect_dead_agents(self, timeout_seconds: int = 300) -> list[str]:
        threshold = int(time.time()) - timeout_seconds
        conn = self._get_conn()
        cursor = conn.execute("""
            SELECT id FROM agents 
            WHERE status NOT IN ('terminated', 'failed') 
            AND last_heartbeat < ?
        """, (threshold,))
        dead_ids = [row[0] for row in cursor.fetchall()]
        conn.close()
        return dead_ids


class Daemon:
    """Main daemon class."""
    
    def __init__(self, session_name: str, port: int = 0):
        self.session_name = session_name
        self.port = port
        self.token = secrets.token_hex(32)
        self.state: DaemonState = None
        self.app = web.Application()
        self._setup_routes()
    
    def _setup_routes(self):
        self.app.router.add_post('/v1/spawn', self.handle_spawn)
        self.app.router.add_post('/v1/heartbeat', self.handle_heartbeat)
        self.app.router.add_get('/v1/agents', self.handle_list_agents)
        self.app.router.add_get('/v1/agents/{agent_id}', self.handle_get_agent)
        self.app.router.add_post('/v1/agents/{agent_id}/terminate', self.handle_terminate)
        self.app.router.add_post('/v1/claim', self.handle_claim)
        self.app.router.add_post('/v1/release', self.handle_release)
        self.app.router.add_get('/v1/claims', self.handle_list_claims)
        self.app.router.add_post('/v1/message', self.handle_send_message)
        self.app.router.add_get('/v1/messages', self.handle_get_messages)
        self.app.router.add_post('/v1/messages/{msg_id}/ack', self.handle_ack_message)
        self.app.router.add_get('/v1/pipeline', self.handle_get_pipeline)
        self.app.router.add_post('/v1/pipeline/advance', self.handle_advance_pipeline)
        self.app.router.add_get('/v1/health', self.handle_health)
    
    async def handle_spawn(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        agent_id = data.get('id') or f"agent-{int(time.time()*1000)}"
        role = data.get('agent') or data.get('role', 'coder')
        task = data.get('task', '')
        adapter = data.get('adapter', 'kiro')
        parent_id = data.get('parent_id')
        
        if not self.state.check_rate_limit(limit_per_minute=5):
            return web.json_response({'error': 'Rate limit exceeded'}, status=429)
        
        if parent_id and self.state.count_children(parent_id) >= 3:
            return web.json_response({'error': 'Max children exceeded'}, status=403)
        
        self.state.register_agent(
            agent_id, role, task, self.session_name,
            adapter=adapter, parent_id=parent_id,
            spawn_config=data, pane_id=None
        )
        self.state.log_event('agent.spawned', {'role': role, 'task': task}, agent_id)
        
        return web.json_response({
            'id': agent_id,
            'status': 'initializing',
            'message': 'Agent registered. Pane launch not yet implemented.'
        })
    
    async def handle_heartbeat(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        agent_id = data.get('id')
        if not agent_id:
            return web.json_response({'error': 'Missing id'}, status=400)
        
        agent = self.state.get_agent(agent_id)
        if not agent:
            return web.json_response({'error': 'Agent not found'}, status=404)
        
        self.state.heartbeat(agent_id)
        return web.json_response({'status': 'ok'})
    
    async def handle_list_agents(self, request: web.Request) -> web.Response:
        agents = self.state.list_agents(self.session_name)
        return web.json_response({'agents': agents})
    
    async def handle_get_agent(self, request: web.Request) -> web.Response:
        agent_id = request.match_info['agent_id']
        agent = self.state.get_agent(agent_id)
        if not agent:
            return web.json_response({'error': 'Agent not found'}, status=404)
        return web.json_response(agent)
    
    async def handle_terminate(self, request: web.Request) -> web.Response:
        agent_id = request.match_info['agent_id']
        agent = self.state.get_agent(agent_id)
        if not agent:
            return web.json_response({'error': 'Agent not found'}, status=404)
        self.state.update_agent_status(agent_id, 'terminated')
        self.state.log_event('agent.done', {'reason': 'terminated'}, agent_id)
        return web.json_response({'status': 'terminated'})
    
    async def handle_claim(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        path = data.get('path')
        agent_id = data.get('agent_id')
        if not path or not agent_id:
            return web.json_response({'error': 'Missing path or agent_id'}, status=400)
        
        success = self.state.claim_file(path, agent_id)
        if not success:
            return web.json_response({'error': 'File already claimed'}, status=409)
        return web.json_response({'status': 'claimed'})
    
    async def handle_release(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        path = data.get('path')
        if not path:
            return web.json_response({'error': 'Missing path'}, status=400)
        
        self.state.release_file(path)
        return web.json_response({'status': 'released'})
    
    async def handle_list_claims(self, request: web.Request) -> web.Response:
        agent_id = request.query.get('agent_id')
        claims = self.state.list_claims(agent_id)
        return web.json_response({'claims': claims})
    
    async def handle_send_message(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        msg_id = data.get('id') or f"msg-{int(time.time()*1000)}"
        content = data.get('content')
        if not content:
            return web.json_response({'error': 'Missing content'}, status=400)
        
        self.state.queue_message(
            msg_id, content,
            from_agent=data.get('from_agent'),
            to_role=data.get('to_role'),
            to_agent=data.get('to_agent')
        )
        return web.json_response({'id': msg_id, 'status': 'queued'})
    
    async def handle_get_messages(self, request: web.Request) -> web.Response:
        to_agent = request.query.get('to_agent')
        to_role = request.query.get('to_role')
        messages = self.state.get_pending_messages(to_agent=to_agent, to_role=to_role)
        return web.json_response({'messages': messages})
    
    async def handle_ack_message(self, request: web.Request) -> web.Response:
        msg_id = request.match_info['msg_id']
        self.state.mark_message_delivered(msg_id)
        return web.json_response({'status': 'acknowledged'})
    
    async def handle_get_pipeline(self, request: web.Request) -> web.Response:
        stage = self.state.get_pipeline_stage(self.session_name)
        return web.json_response({'stage': stage})
    
    async def handle_advance_pipeline(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)
        
        stage = data.get('stage')
        if not stage:
            return web.json_response({'error': 'Missing stage'}, status=400)
        
        valid_stages = ['plan', 'test', 'sprint', 'review', 'done', 'failed']
        if stage not in valid_stages:
            return web.json_response({'error': f'Invalid stage. Valid: {valid_stages}'}, status=400)
        
        self.state.set_pipeline_stage(self.session_name, stage)
        self.state.log_event('pipeline.advanced', {'stage': stage})
        return web.json_response({'stage': stage})
    
    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({'status': 'healthy', 'session': self.session_name})
    
    async def health_monitor(self, app: web.Application):
        while True:
            await asyncio.sleep(30)
            dead_agents = self.state.detect_dead_agents(timeout_seconds=300)
            for agent_id in dead_agents:
                self.state.update_agent_status(agent_id, 'failed')
                self.state.log_event('agent.done', {'reason': 'heartbeat_timeout'}, agent_id)
    
    async def start(self):
        port_file = Path(f"/tmp/aw-daemon-{self.session_name}.json")
        db_path = str(Path(f"/tmp/aw-daemon-{self.session_name}.db"))
        
        self.state = DaemonState(db_path)
        
        # If port is 0, find an available port
        actual_port = self.port
        if actual_port == 0:
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', 0))
                actual_port = s.getsockname()[1]
        
        runner = web.AppRunner(self.app)
        await runner.setup()
        
        site = web.TCPSite(runner, '127.0.0.1', actual_port)
        await site.start()
        
        port_file.write_text(json.dumps({
            'port': actual_port,
            'token': self.token,
            'session': self.session_name,
            'pid': os.getpid()
        }))
        
        asyncio.create_task(self.health_monitor(self.app))
        
        print(f"Daemon started on port {actual_port} for session '{self.session_name}'")
        print(f"Port file: {port_file}")
        
        while True:
            await asyncio.sleep(3600)


@click.group()
def cli():
    """Agent Workstation session daemon."""
    pass


@cli.command()
@click.option("--session", default="default", help="Zellij session name")
@click.option("--port", default=0, help="Port (0 = auto)")
def start(session: str, port: int):
    """Start the daemon."""
    daemon = Daemon(session, port)
    asyncio.run(daemon.start())


if __name__ == "__main__":
    cli()
