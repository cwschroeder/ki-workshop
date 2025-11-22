"""
SIP Bot Launcher
Starts either TranscriptionBot or AgentBot based on configuration
"""

import asyncio
import logging
import os
from dotenv import load_dotenv
from transcription_bot import TranscriptionBot
from agent_bot import AgentBot

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def main():
    """Main entry point"""
    try:
        # Load configuration
        config = {
            'sip_domain': os.getenv('SIP_DOMAIN'),
            'sip_username': os.getenv('SIP_USERNAME'),
            'sip_password': os.getenv('SIP_PASSWORD'),
            'openai_api_key': os.getenv('OPENAI_API_KEY'),
            'backend_ws_url': os.getenv('BACKEND_WS_URL'),
            'bot_mode': os.getenv('BOT_MODE', 'transcription'),
            'ai_system_prompt': os.getenv(
                'AI_AGENT_SYSTEM_PROMPT',
                'Du bist ein freundlicher Mitarbeiter beim Stadtwerk.'
            )
        }

        # Validate configuration
        required_fields = ['sip_domain', 'sip_username', 'sip_password', 'openai_api_key']
        for field in required_fields:
            if not config[field]:
                raise ValueError(f"Missing required configuration: {field}")

        # Start appropriate bot
        if config['bot_mode'] == 'transcription':
            logger.info("Starting in TRANSCRIPTION mode")
            bot = TranscriptionBot(config)
        elif config['bot_mode'] == 'agent':
            logger.info("Starting in AI AGENT mode")
            bot = AgentBot(config)
        else:
            raise ValueError(f"Invalid BOT_MODE: {config['bot_mode']}")

        # Run bot
        await bot.start()

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
