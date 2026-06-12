import json
import time
import urllib.request
import urllib.error
import logging
from typing import Optional

logger = logging.getLogger("uvicorn.error")

class BaseLLMProvider:
    def analyze(self, text: str) -> dict:
        raise NotImplementedError("Subclasses must implement analyze()")

class MockProvider(BaseLLMProvider):
    def analyze(self, text: str) -> dict:
        time.sleep(1.5) # Simulate API latency
        
        words = text.split()
        word_count = len(words)
        preview = " ".join(words[:5]) + "..." if word_count > 5 else text
        
        # Generate dummy content based on text length
        return {
            "title": f"Analisi di: {preview}",
            "summary": f"Questo è un riepilogo simulato della trascrizione che contiene {word_count} parole. Il testo analizza i temi principali introdotti nel discorso, evidenziando i passaggi chiave discussi dall'utente.",
            "key_points": [
                "Punto chiave 1: Introduzione e contesto iniziale della registrazione.",
                f"Punto chiave 2: Analisi quantitativa dei dati (rilevate {word_count} parole nel testo).",
                "Punto chiave 3: Conclusioni e considerazioni finali emerse durante la sessione."
            ],
            "action_items": [
                "Verificare la correttezza della trascrizione importata.",
                "Configurare una chiave API Gemini reale per ottenere analisi reali.",
                "Condividere i punti chiave del riepilogo con il team."
            ]
        }

class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def analyze(self, text: str) -> dict:
        if not self.api_key:
            raise ValueError("Chiave API Gemini mancante o non configurata.")
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.api_key}"
        
        prompt = (
            "Analizza la seguente trascrizione audio e restituisci un oggetto JSON strutturato. "
            "La trascrizione è la seguente:\n\n"
            f"{text}\n\n"
            "Il JSON di risposta deve avere esattamente questo schema:\n"
            "{\n"
            '  "title": "Un titolo breve e significativo per la discussione (in italiano)",\n'
            '  "summary": "Un riassunto coerente e approfondito di circa 3-4 frasi (in italiano)",\n'
            '  "key_points": ["Punto chiave 1", "Punto chiave 2", ... (almeno 3 punti chiave in italiano)],\n'
            '  "action_items": ["Azione da intraprendere 1", ... (se presenti, altrimenti lista vuota, in italiano)]\n'
            "}"
        )
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "title": {"type": "STRING"},
                        "summary": {"type": "STRING"},
                        "key_points": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"}
                        },
                        "action_items": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"}
                        }
                    },
                    "required": ["title", "summary", "key_points", "action_items"]
                }
            }
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                
                # Extract text response from Gemini structure
                candidates = res_data.get("candidates", [])
                if not candidates:
                    raise ValueError("Nessuna risposta generata da Gemini.")
                    
                content_text = candidates[0]["content"]["parts"][0]["text"]
                return json.loads(content_text)
                
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            logger.error(f"Gemini HTTP Error: {e.code} - {err_body}")
            raise Exception(f"Errore Gemini API: {e.code} - {err_body}")
        except Exception as e:
            logger.error(f"Errore durante la chiamata a Gemini: {e}")
            raise Exception(f"Errore durante l'analisi con Gemini: {str(e)}")

class LLMService:
    @staticmethod
    def get_provider(provider_name: str, api_key: Optional[str] = None) -> BaseLLMProvider:
        if provider_name == "gemini":
            return GeminiProvider(api_key or "")
        return MockProvider()
