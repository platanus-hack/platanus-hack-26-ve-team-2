import base64

from elevenlabs.client import AsyncElevenLabs

from app.voice.ports import CharTiming, SpeechAudio, TextToSpeech

_MIME_BY_CODEC = {
    "mp3": "audio/mpeg",
    "pcm": "audio/pcm",
    "opus": "audio/ogg",
    "ulaw": "audio/basic",
}


class ElevenLabsTTS(TextToSpeech):
    name = "elevenlabs"

    def __init__(self, client: AsyncElevenLabs, model_id: str, output_format: str) -> None:
        self._client = client
        self._model_id = model_id
        self._output_format = output_format
        self._mime = _MIME_BY_CODEC.get(output_format.split("_")[0], "application/octet-stream")

    async def synthesize(self, text: str, voice_id: str, language: str) -> SpeechAudio:
        result = await self._client.text_to_speech.convert_with_timestamps(
            voice_id=voice_id,
            text=text,
            model_id=self._model_id,
            language_code=language,
            output_format=self._output_format,
        )
        timings: list[CharTiming] = []
        if a := result.alignment:
            timings = [
                CharTiming(c, s, e)
                for c, s, e in zip(
                    a.characters,
                    a.character_start_times_seconds,
                    a.character_end_times_seconds,
                    strict=True,
                )
            ]
        return SpeechAudio(
            audio=base64.b64decode(result.audio_base_64),
            mime_type=self._mime,
            char_timings=timings,
        )
