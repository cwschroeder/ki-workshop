"""
Transcription Bot - SIP Call Monitoring with OpenAI Whisper
Connects to active calls via SIP and streams transcriptions to dashboard
"""

import pjsua2 as pj
import asyncio
import logging
from typing import Optional
from openai import AsyncOpenAI
import io
import wave

logger = logging.getLogger(__name__)


class TranscriptionCall(pj.Call):
    """
    SIP call handler for transcription monitoring
    Captures RTP audio and sends to OpenAI Whisper for transcription
    """

    def __init__(self, account: pj.Account, openai_client: AsyncOpenAI, ws_sender):
        super().__init__(account)
        self.openai = openai_client
        self.ws_sender = ws_sender
        self.recorder: Optional[pj.AudioMediaRecorder] = None
        self.is_recording = False

    def onCallState(self, prm: pj.OnCallStateParam):
        """Handle call state changes"""
        ci = self.getInfo()

        if ci.state == pj.PJSIP_INV_STATE_CONFIRMED:
            logger.info(f"Call connected: {ci.remoteUri}")

        elif ci.state == pj.PJSIP_INV_STATE_DISCONNECTED:
            logger.info(f"Call ended: {ci.remoteUri}")
            self.is_recording = False

    def onCallMediaState(self, prm: pj.OnCallMediaStateParam):
        """Handle media state changes - capture audio stream"""
        ci = self.getInfo()

        for mi in ci.media:
            if mi.type == pj.PJMEDIA_TYPE_AUDIO and mi.status == pj.PJSUA_CALL_MEDIA_ACTIVE:
                logger.info("Audio media active, starting transcription")

                # Get audio media
                aud_media = self.getAudioMedia(mi.index)

                # Create recorder to capture RTP audio
                self.recorder = pj.AudioMediaRecorder()

                # Start transmitting audio to recorder
                aud_media.startTransmit(self.recorder)

                self.is_recording = True

                # Start async transcription loop
                asyncio.create_task(self._transcription_loop())

    async def _transcription_loop(self):
        """
        Continuously capture audio chunks and send to Whisper
        Streams transcriptions to dashboard via WebSocket
        """
        chunk_duration = 2  # seconds

        while self.is_recording:
            try:
                # Get audio chunk from recorder
                audio_data = await self._get_audio_chunk(chunk_duration)

                if not audio_data:
                    await asyncio.sleep(0.1)
                    continue

                # Transcribe with OpenAI Whisper
                transcript = await self._transcribe_audio(audio_data)

                if transcript:
                    logger.info(f"Transcription: {transcript}")

                    # Send to dashboard via WebSocket
                    await self.ws_sender.send_transcript(transcript)

            except Exception as e:
                logger.error(f"Transcription error: {e}")
                await asyncio.sleep(1)

    async def _get_audio_chunk(self, duration: float) -> Optional[bytes]:
        """
        Get audio chunk from PJSUA2 recorder
        Returns raw PCM audio data
        """
        try:
            # PJSUA2 recorder provides PCM samples
            # We need to convert to WAV format for Whisper

            # Get recorded samples (this is a simplified version)
            # In production, you'd need to properly handle PJSUA2 audio buffers
            samples = self.recorder.getData()

            if not samples:
                return None

            # Convert PCM to WAV format
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(16000)  # 16kHz (Whisper's native rate)
                wav_file.writeframes(samples)

            wav_buffer.seek(0)
            return wav_buffer.read()

        except Exception as e:
            logger.error(f"Audio chunk error: {e}")
            return None

    async def _transcribe_audio(self, audio_data: bytes) -> Optional[str]:
        """
        Transcribe audio using OpenAI Whisper API
        """
        try:
            # Create file-like object for OpenAI API
            audio_file = io.BytesIO(audio_data)
            audio_file.name = "audio.wav"

            # Call Whisper API
            response = await self.openai.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="de"  # German
            )

            return response.text.strip()

        except Exception as e:
            logger.error(f"Whisper API error: {e}")
            return None


class TranscriptionBot:
    """
    Main transcription bot service
    Manages SIP account and incoming call handling
    """

    def __init__(self, config: dict):
        self.config = config
        self.ep: Optional[pj.Endpoint] = None
        self.account: Optional[pj.Account] = None
        self.openai_client = AsyncOpenAI(api_key=config['openai_api_key'])
        self.ws_sender = None  # WebSocket sender to dashboard

    async def start(self):
        """Initialize and start the SIP bot"""
        try:
            logger.info("Starting Transcription Bot")

            # Create PJSUA2 endpoint
            self.ep = pj.Endpoint()
            self.ep.libCreate()

            # Configure endpoint
            ep_cfg = pj.EpConfig()
            ep_cfg.logConfig.level = 4
            self.ep.libInit(ep_cfg)

            # Configure SIP transport
            transport_cfg = pj.TransportConfig()
            transport_cfg.port = 5060
            self.ep.transportCreate(pj.PJSIP_TRANSPORT_UDP, transport_cfg)

            # Create SIP account
            acc_cfg = pj.AccountConfig()
            acc_cfg.idUri = f"sip:{self.config['sip_username']}@{self.config['sip_domain']}"
            acc_cfg.regConfig.registrarUri = f"sip:{self.config['sip_domain']}"

            # Add authentication credentials
            cred = pj.AuthCredInfo()
            cred.scheme = "digest"
            cred.realm = "*"
            cred.username = self.config['sip_username']
            cred.data = self.config['sip_password']
            cred.dataType = pj.PJSIP_CRED_DATA_PLAIN_PASSWD
            acc_cfg.sipConfig.authCreds.append(cred)

            # Create account
            self.account = pj.Account()
            self.account.create(acc_cfg)

            # Start PJSUA2
            self.ep.libStart()

            logger.info(f"SIP bot registered: {acc_cfg.idUri}")

            # Keep running
            while True:
                await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Failed to start transcription bot: {e}")
            raise

    async def stop(self):
        """Gracefully shutdown the bot"""
        try:
            logger.info("Stopping Transcription Bot")

            if self.ep:
                self.ep.libDestroy()

        except Exception as e:
            logger.error(f"Shutdown error: {e}")
