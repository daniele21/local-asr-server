from __future__ import annotations

import logging
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image

logger = logging.getLogger("uvicorn.error")

_VISION_AVAILABLE = False
try:
    import objc
    from Foundation import NSData
    # Load Vision bundle dynamically
    objc.loadBundle(
        'Vision',
        bundle_path='/System/Library/Frameworks/Vision.framework',
        module_globals=globals()
    )
    objc.registerMetaDataForSelector(
        b"VNImageRequestHandler",
        b"performRequests:error:",
        {"arguments": {3: {"type_modifier": b"o"}}},
    )
    _VISION_AVAILABLE = True
except Exception as e:
    logger.warning("macOS native Vision framework not available: %s. Local OCR will be disabled.", e)


def recognize_text_in_image(
    image_path: Path,
    roi: tuple[float, float, float, float] | None = None
) -> list[str]:
    """Recognize text in an image using native macOS Vision framework via PyObjC.

    If roi is specified (as normal coordinates: left, top, right, bottom),
    the image is cropped to the ROI before text recognition.
    """
    if not _VISION_AVAILABLE:
        return []

    if not image_path.exists():
        logger.warning("Image path does not exist: %s", image_path)
        return []

    # If ROI is specified, crop the image
    if roi:
        cropped_path: Path | None = None
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                left, top, right, bottom = roi
                # Convert normalized coordinates to absolute pixels
                l_px = int(left * width)
                t_px = int(top * height)
                r_px = int(right * width)
                b_px = int(bottom * height)

                # Check bounds
                l_px = max(0, min(width - 1, l_px))
                r_px = max(l_px + 1, min(width, r_px))
                t_px = max(0, min(height - 1, t_px))
                b_px = max(t_px + 1, min(height, b_px))

                cropped = img.crop((l_px, t_px, r_px, b_px))
                with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    cropped_path = Path(tmp.name)
                    # Convert to RGB to support JPEG
                    cropped.convert("RGB").save(str(cropped_path), format="JPEG")

            return _run_vision_ocr(cropped_path)
        except Exception as e:
            logger.warning("Failed to perform ROI crop for OCR: %s", e)
            return []
        finally:
            if cropped_path is not None:
                try:
                    cropped_path.unlink(missing_ok=True)
                except Exception:
                    pass
    else:
        return _run_vision_ocr(image_path)


def _run_vision_ocr(image_path: Path) -> list[str]:
    """Run the native macOS Vision OCR requests."""
    try:
        VNImageRequestHandler = objc.lookUpClass('VNImageRequestHandler')
        VNRecognizeTextRequest = objc.lookUpClass('VNRecognizeTextRequest')
    except Exception as e:
        logger.warning("Failed to look up Vision OCR classes: %s", e)
        return []

    try:
        image_data = NSData.dataWithContentsOfFile_(str(image_path))
        if image_data is None:
            return []
        handler = VNImageRequestHandler.alloc().initWithData_options_(image_data, {})

        request = VNRecognizeTextRequest.alloc().init()
        request.setRecognitionLevel_(1)
        request.setUsesLanguageCorrection_(False)

        performed = handler.performRequests_error_([request], None)
        if isinstance(performed, tuple):
            success, error = performed
        else:
            success, error = bool(performed), None
        if not success and error is not None:
            logger.warning("Vision performRequests failed: %s", error)
            return []

        texts: list[str] = []
        observations = request.results()
        if observations:
            for observation in observations:
                candidates = observation.topCandidates_(1)
                if candidates:
                    texts.append(str(candidates[0].string()))
        return texts
    except Exception as e:
        logger.warning("Vision OCR error: %s", e)
        return []
