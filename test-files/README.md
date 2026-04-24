# Demo Upload Test Files

These files are safe synthetic samples for showcasing the upload scanner.

They are **not real malware** and exist only to demonstrate how the current detection pipeline responds to each supported upload format.

## Expected upload results

### Allowed
- `clean.pdf`
- `clean.docx`
- `clean.png`
- `clean.jpeg`

### Blocked
- `malicious.pdf`
- `malicious.docx`
- `malicious.png`
- `malicious.jpeg`

## Expected detection path

- `malicious.pdf`
  - PDF model risk score
  - PDF suspicious feature checks
  - PDF YARA rule match

- `malicious.docx`
  - DOCX structural scan
  - DOCX YARA rule match

- `malicious.png`
  - Image YARA rule match

- `malicious.jpeg`
  - Image YARA rule match

## Notes

- `malicious.pdf` is the existing harmless demo trigger PDF already used by the project.
- `malicious.docx` contains a harmless embedded-path marker so the current DOCX scanner flags it.
- `malicious.png` and `malicious.jpeg` contain harmless string markers designed to trigger the current image YARA rule.
- JPEG is represented once as `.jpeg`; the app treats `.jpg` and `.jpeg` as the same upload family for this demo.
