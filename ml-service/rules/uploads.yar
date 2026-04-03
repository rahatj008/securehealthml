rule pdf_javascript_or_auto_action
{
  meta:
    severity = "high"
    file_type = "pdf"
  strings:
    $pdf = "%PDF-" ascii
    $js = "/JavaScript" ascii nocase
    $js_short = "/JS" ascii nocase
    $open_action = "/OpenAction" ascii nocase
    $aa = "/AA" ascii nocase
  condition:
    $pdf at 0 and any of ($js, $js_short, $open_action, $aa)
}

rule pdf_embedded_payload_markers
{
  meta:
    severity = "high"
    file_type = "pdf"
  strings:
    $pdf = "%PDF-" ascii
    $launch = "/Launch" ascii nocase
    $embedded = "/EmbeddedFile" ascii nocase
    $richmedia = "/RichMedia" ascii nocase
    $xfa = "/XFA" ascii nocase
    $jbig2 = "/JBIG2Decode" ascii nocase
  condition:
    $pdf at 0 and any of ($launch, $embedded, $richmedia, $xfa, $jbig2)
}

rule docx_macro_or_embedding_markers
{
  meta:
    severity = "high"
    file_type = "docx"
  strings:
    $zip = { 50 4B 03 04 }
    $vba = "word/vbaProject.bin" ascii nocase
    $activex = "word/activeX/" ascii nocase
    $embedding = "word/embeddings/" ascii nocase
    $ole = "oleObject" ascii nocase
  condition:
    $zip at 0 and any of ($vba, $activex, $embedding, $ole)
}

rule docx_external_relationship_target
{
  meta:
    severity = "medium"
    file_type = "docx"
  strings:
    $zip = { 50 4B 03 04 }
    $external = "TargetMode=\"External\"" ascii nocase
    $http = "http://" ascii nocase
    $https = "https://" ascii nocase
  condition:
    $zip at 0 and $external and any of ($http, $https)
}

rule image_embedded_executable_or_script
{
  meta:
    severity = "high"
    file_type = "image"
  strings:
    $png = { 89 50 4E 47 0D 0A 1A 0A }
    $jpeg = { FF D8 FF }
    $mz = "MZ" ascii
    $elf = { 7F 45 4C 46 }
    $script = "<script" ascii nocase
    $svg = "<svg" ascii nocase
  condition:
    ($png at 0 or $jpeg at 0) and (
      (#mz > 0 and for any i in (1..#mz) : (@mz[i] > 64)) or
      (#elf > 0 and for any i in (1..#elf) : (@elf[i] > 64)) or
      (#script > 0 and for any i in (1..#script) : (@script[i] > 64)) or
      (#svg > 0 and for any i in (1..#svg) : (@svg[i] > 64))
    )
}
