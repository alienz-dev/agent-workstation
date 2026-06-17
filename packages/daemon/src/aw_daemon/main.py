"""Entry point for the daemon."""
import click


@click.group()
def cli():
    """Agent Workstation session daemon."""
    pass


@cli.command()
@click.option("--session", default="default", help="Zellij session name")
@click.option("--port", default=0, help="Port (0 = auto)")
def start(session: str, port: int):
    """Start the daemon."""
    click.echo(f"Starting daemon for session '{session}'...")
    # TODO: implement


if __name__ == "__main__":
    cli()
