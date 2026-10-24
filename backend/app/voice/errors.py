class VoiceError(Exception):
    """Base de los errores del dominio de voz. `code` es estable y se expone al cliente."""

    code = "voice_error"


class UnknownCharacterError(VoiceError):
    code = "unknown_character"


class SessionNotFoundError(VoiceError):
    code = "session_not_found"


class InvalidInputError(VoiceError):
    code = "invalid_input"


class NoSpeechError(VoiceError):
    code = "no_speech"


class ProviderError(VoiceError):
    """Fallo de un proveedor externo. El mensaje es genérico; el detalle va solo al log."""

    code = "provider_error"

    def __init__(self, stage: str) -> None:
        super().__init__(f"Fallo del proveedor en la etapa '{stage}'")
        self.stage = stage


class VoiceUnavailableError(VoiceError):
    code = "voice_unavailable"
