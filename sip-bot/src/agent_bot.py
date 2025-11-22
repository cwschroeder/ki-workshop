"""
AI Agent Bot - Simulated Human Agent for Testing
Connects to calls via SIP and provides AI-powered customer support
"""

import pjsua2 as pj
import asyncio
import logging
from typing import Optional, List, Dict
from openai import AsyncOpenAI
import io
import wave

logger = logging.getLogger(__name__)


class AgentCall(pj.Call):
    """
    SIP call handler for AI agent simulation
    Captures caller speech, generates AI responses, and plays TTS audio
    """

    def __init__(
        self,
        account: pj.Account,
        openai_client: AsyncOpenAI,
        system_prompt: str
    ):
        super().__init__(account)
        self.openai = openai_client
        self.system_prompt = system_prompt
        self.recorder: Optional[pj.AudioMediaRecorder] = None
        self.player: Optional[pj.AudioMediaPlayer] = None
        self.conversation_history: List[Dict[str, str]] = []
        self.is_active = False

    def onCallState(self, prm: pj.OnCallStateParam):
        """Handle call state changes"""
        ci = self.getInfo()

        if ci.state == pj.PJSIP_INV_STATE_CONFIRMED:
            logger.info(f"Agent call connected: {ci.remoteUri}")
            self.is_active = True

            # Start conversation with greeting
            asyncio.create_task(self._send_greeting())

        elif ci.state == pj.PJSIP_INV_STATE_DISCONNECTED:
            logger.info(f"Agent call ended: {ci.remoteUri}")
            self.is_active = False

    def onCallMediaState(self, prm: pj.OnCallMediaStateParam):
        """Handle media state changes"""
        ci = self.getInfo()

        for mi in ci.media:
            if mi.type == pj.PJMEDIA_TYPE_AUDIO and mi.status == pj.PJSUA_CALL_MEDIA_ACTIVE:
                logger.info("Audio media active, starting AI agent conversation")

                # Get audio media
                aud_media = self.getAudioMedia(mi.index)

                # Create recorder for capturing user speech
                self.recorder = pj.AudioMediaRecorder()
                aud_media.startTransmit(self.recorder)

                # Create player for TTS playback
                self.player = pj.AudioMediaPlayer()
                self.player.startTransmit(aud_media)

                # Start conversation loop
                asyncio.create_task(self._conversation_loop())

    async def _send_greeting(self):
        """Send initial greeting to caller"""
        await asyncio.sleep(0.5)  # Brief pause before greeting

        greeting = "Guten Tag. Willkommen beim Stadtwerk. Wie kann ich Ihnen helfen?"
        await self._speak(greeting)

    async def _conversation_loop(self):
        """
        Main conversation loop:
        1. Listen to user speech
        2. Transcribe with Whisper
        3. Generate AI response with GPT
        4. Speak response with TTS
        """
        while self.is_active:
            try:
                # Record user speech (with silence detection)
                audio_data = await self._listen_for_speech()

                if not audio_data:
                    # No speech detected, prompt user
                    await self._speak("Ich habe Sie nicht verstanden. Bitte wiederholen Sie.")
                    continue

                # Transcribe user speech
                user_text = await self._transcribe(audio_data)

                if not user_text:
                    await self._speak("Entschuldigung, ich habe Sie nicht verstanden.")
                    continue

                logger.info(f"User: {user_text}")

                # Add to conversation history
                self.conversation_history.append({
                    "role": "user",
                    "content": user_text
                })

                # Generate AI response
                response_text, should_end = await self._generate_response()

                logger.info(f"Agent: {response_text}")

                # Add to conversation history
                self.conversation_history.append({
                    "role": "assistant",
                    "content": response_text
                })

                # Speak response
                await self._speak(response_text)

                # End call if requested
                if should_end:
                    await asyncio.sleep(1)
                    self.hangup(pj.CallOpParam())
                    break

            except Exception as e:
                logger.error(f"Conversation loop error: {e}")
                await asyncio.sleep(1)

    async def _listen_for_speech(self, max_duration: float = 10.0) -> Optional[bytes]:
        """
        Record user speech with silence detection
        Returns audio data when user finishes speaking
        """
        try:
            # Wait for speech activity
            # This is a simplified version - production would need VAD (Voice Activity Detection)

            await asyncio.sleep(max_duration)

            # Get recorded audio
            samples = self.recorder.getData()

            if not samples:
                return None

            # Convert to WAV format
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(16000)
                wav_file.writeframes(samples)

            wav_buffer.seek(0)
            return wav_buffer.read()

        except Exception as e:
            logger.error(f"Listen error: {e}")
            return None

    async def _transcribe(self, audio_data: bytes) -> Optional[str]:
        """Transcribe user speech using OpenAI Whisper"""
        try:
            audio_file = io.BytesIO(audio_data)
            audio_file.name = "speech.wav"

            response = await self.openai.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="de"
            )

            return response.text.strip()

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None

    async def _generate_response(self) -> tuple[str, bool]:
        """
        Generate AI response using GPT-4o-mini
        Returns (response_text, should_end_call)
        """
        try:
            # Prepare messages for GPT
            messages = [
                {"role": "system", "content": self.system_prompt}
            ] + self.conversation_history

            # Call GPT API
            response = await self.openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.8,
                max_tokens=200
            )

            response_text = response.choices[0].message.content.strip()

            # Check if agent wants to end call
            should_end = "[ENDE]" in response_text
            response_text = response_text.replace("[ENDE]", "").strip()

            return response_text, should_end

        except Exception as e:
            logger.error(f"GPT error: {e}")
            return "Es tut mir leid, es gab einen technischen Fehler.", True

    async def _speak(self, text: str):
        """
        Convert text to speech and play to caller
        Uses OpenAI TTS
        """
        try:
            logger.debug(f"Speaking: {text}")

            # Generate TTS audio
            response = await self.openai.audio.speech.create(
                model="tts-1",
                voice="nova",  # Female voice
                input=text,
                speed=1.0
            )

            # Get audio data
            audio_data = response.content

            # Save to temp file for PJSUA2 player
            # (PJSUA2 player reads from files)
            import tempfile
            import os

            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                tmp.write(audio_data)
                tmp_path = tmp.name

            # Play audio file
            if self.player:
                self.player.createPlayer(tmp_path)
                self.player.startTransmit(self.getAudioMedia(-1))

                # Wait for playback to complete
                # (In production, you'd need proper playback completion detection)
                audio_duration = len(text) * 0.1  # Rough estimate
                await asyncio.sleep(audio_duration)

            # Clean up temp file
            os.unlink(tmp_path)

        except Exception as e:
            logger.error(f"TTS error: {e}")


class AgentBot:
    """
    Main AI agent bot service
    Simulates human agent for testing/DEV purposes
    """

    def __init__(self, config: dict):
        self.config = config
        self.ep: Optional[pj.Endpoint] = None
        self.account: Optional[pj.Account] = None
        self.openai_client = AsyncOpenAI(api_key=config['openai_api_key'])

    async def start(self):
        """Initialize and start the AI agent bot"""
        try:
            logger.info("Starting AI Agent Bot")

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

            logger.info(f"AI Agent bot registered: {acc_cfg.idUri}")

            # Keep running
            while True:
                await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Failed to start agent bot: {e}")
            raise

    async def stop(self):
        """Gracefully shutdown the bot"""
        try:
            logger.info("Stopping AI Agent Bot")

            if self.ep:
                self.ep.libDestroy()

        except Exception as e:
            logger.error(f"Shutdown error: {e}")
