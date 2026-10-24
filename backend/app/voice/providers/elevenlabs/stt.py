from elevenlabs.client import AsyncElevenLabs

from app.voice.ports import AudioInput, SpeechToText


class ElevenLabsSTT(SpeechToText):
    """Scribe: acepta webm/opus, m4a, mp3, wav... directamente, sin decodificar en el backend."""

    name = "elevenlabs"

    def __init__(self, client: AsyncElevenLabs, model_id: str) -> None:
        self._client = client
        self._model_id = model_id

    async def transcribe(self, audio: AudioInput, language: str, keyterms: list[str]) -> str:
        result = await self._client.speech_to_text.convert(
            model_id=self._model_id,
            file=(audio.filename, audio.data, audio.mime_type),
            language_code=language,
            tag_audio_events=False,  # sin "(risas)", "(ruido)" en el texto
            keyterms=keyterms or None,
        )
        return (result.text or "").strip()
