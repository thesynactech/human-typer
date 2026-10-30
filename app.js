const elements = {
  documentInput: document.querySelector("#document-input"),
  insertMode: document.querySelector("#insert-mode"),
  documentWarning: document.querySelector("#document-warning"),
  googleAccountStatus: document.querySelector("#google-account-status"),
  googleAccountDetail: document.querySelector("#google-account-detail"),
  googleConnectButton: document.querySelector("#google-connect-button"),
  hostedSiteLink: document.querySelector("#hosted-site-link"),
  clientConfig: document.querySelector("#client-config"),
  titleInput: document.querySelector("#title-input"),
  bodyInput: document.querySelector("#body-input"),
  characterCount: document.querySelector("#character-count"),
  titleBold: document.querySelector("#title-bold"),
  titleCenter: document.querySelector("#title-center"),
  titleCustomSize: document.querySelector("#title-custom-size"),
  titleSize: document.querySelector("#title-size"),
  bodySize: document.querySelector("#body-size"),
  mlaFormat: document.querySelector("#mla-format"),
  fontInput: document.querySelector("#font-input"),
  lineSpacing: document.querySelector("#line-spacing"),
  customSpacingWrap: document.querySelector("#custom-spacing-wrap"),
  customSpacing: document.querySelector("#custom-spacing"),
  indentParagraphs: document.querySelector("#indent-paragraphs"),
  speedRange: document.querySelector("#speed-range"),
  speedValue: document.querySelector("#speed-value"),
  mistakesRange: document.querySelector("#mistakes-range"),
  mistakesValue: document.querySelector("#mistakes-value"),
  delayRange: document.querySelector("#delay-range"),
  delayValue: document.querySelector("#delay-value"),
  previewState: document.querySelector("#preview-state"),
  previewTitle: document.querySelector("#preview-title"),
  previewBody: document.querySelector("#preview-body"),
  typingCaret: document.querySelector("#typing-caret"),
  progressLabel: document.querySelector("#progress-label"),
  actionHint: document.querySelector("#action-hint"),
  startButton: document.querySelector("#start-button"),
  stopButton: document.querySelector("#stop-button"),
  copyButton: document.querySelector("#copy-button"),
  downloadButton: document.querySelector("#download-button"),
  clearButton: document.querySelector("#clear-button"),
  toast: document.querySelector("#toast"),
  screenReaderStatus: document.querySelector("#screen-reader-status"),
};

const GOOGLE_OAUTH_CLIENT_ID = "980437754852-g76tin7pnst3727o1rkd9uekvndvlvld.apps.googleusercontent.com";
const PRODUCTION_ORIGIN = "https://human-typer.pages.dev";
const IS_PRODUCTION_ORIGIN = location.origin === PRODUCTION_ORIGIN;
const DOCS_API = "https://docs.googleapis.com/v1/documents";
const NEIGHBORS = {
  q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij",
  i: "uok", o: "ipl", p: "ol", a: "qsz", s: "awdx", d: "sefc", f: "drgv",
  g: "fthb", h: "gyjn", j: "hukm", k: "jil", l: "kop", z: "asx", x: "zsc",
  c: "xdv", v: "cfb", b: "vgn", n: "bhm", m: "nj",
};

let runId = 0;
let timeoutId = null;
let resolvePause = null;
let toastTimeout = null;
let outputTitle = "";
let outputBody = "";
let renderedDocumentChars = 0;
let isRunning = false;
let hasRun = false;
let hasRemoteChanges = false;
let accessToken = null;
let accessTokenExpiresAt = 0;
let oauthClient = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function say(message) {
  elements.screenReaderStatus.textContent = message;
}

function setState(state, message) {
  elements.previewState.dataset.state = state;
  elements.previewState.lastChild.textContent = ` ${message}`;
}

function setGoogleStatus(heading, detail) {
  elements.googleAccountStatus.textContent = heading;
  elements.googleAccountDetail.textContent = detail;
}

function getSettings(validate = true) {
  const isMla = elements.mlaFormat.checked;
  const rawTitleSize = Number(elements.titleSize.value);
  const rawBodySize = Number(elements.bodySize.value);
  const rawCustomSpacing = Number(elements.customSpacing.value);

  if (validate && (!Number.isInteger(rawTitleSize) || rawTitleSize < 1 || rawTitleSize > 400)) {
    throw new Error("Title size must be a whole number from 1 to 400 pt.");
  }
  if (validate && (!Number.isInteger(rawBodySize) || rawBodySize < 1 || rawBodySize > 400)) {
    throw new Error("Body size must be a whole number from 1 to 400 pt.");
  }
  if (validate && elements.lineSpacing.value === "custom" &&
      (!Number.isFinite(rawCustomSpacing) || rawCustomSpacing < 0.5 || rawCustomSpacing > 5)) {
    throw new Error("Custom line spacing must be between 0.5 and 5.");
  }

  const titleSize = Number.isFinite(rawTitleSize) && rawTitleSize >= 1 && rawTitleSize <= 400 ? rawTitleSize : 14;
  const bodySize = Number.isFinite(rawBodySize) && rawBodySize >= 1 && rawBodySize <= 400 ? rawBodySize : 12;
  const customSpacing = Number.isFinite(rawCustomSpacing) && rawCustomSpacing >= 0.5 && rawCustomSpacing <= 5 ? rawCustomSpacing : 1.25;

  return {
    title: elements.titleInput.value.trim(),
    text: elements.bodyInput.value,
    titleBold: elements.titleBold.checked,
    titleCenter: elements.titleCenter.checked,
    titleCustomSize: elements.titleCustomSize.checked,
    titleSize,
    bodySize,
    isMla,
    font: isMla ? "Times New Roman" : elements.fontInput.value.trim(),
    spacing: isMla ? 2 : (elements.lineSpacing.value === "custom" ? customSpacing : Number(elements.lineSpacing.value)),
    indent: elements.indentParagraphs.checked,
    wpm: Number(elements.speedRange.value),
    errorRate: Number(elements.mistakesRange.value) / 100,
    delay: Number(elements.delayRange.value),
    keepLineSpacing: !isMla && elements.lineSpacing.value === "1.2",
  };
}

function updatePreviewStyles(settings) {
  elements.previewTitle.hidden = !outputTitle;
  elements.previewTitle.style.fontWeight = settings.titleBold ? "700" : "400";
  elements.previewTitle.style.textAlign = settings.titleCenter ? "center" : "left";
  elements.previewTitle.style.fontSize = `${settings.titleCustomSize ? settings.titleSize : 14}pt`;
  elements.previewTitle.style.fontFamily = settings.font || "";
  elements.previewBody.style.fontFamily = settings.font || "Georgia, serif";
  elements.previewBody.style.fontSize = `${settings.isMla ? 12 : settings.bodySize}pt`;
  elements.previewBody.style.lineHeight = String(settings.spacing);
}

function renderPreview(settings = getSettings(false)) {
  updatePreviewStyles(settings);
  elements.previewTitle.textContent = outputTitle;
  elements.previewBody.textContent = outputBody;
  elements.typingCaret.hidden = !isRunning;
  const sourceLength = settings.title.length + settings.text.length;
  const written = outputTitle.length + outputBody.replaceAll("\t", "").length;
  elements.progressLabel.textContent = hasRun
    ? `${Math.min(written, sourceLength)} of ${sourceLength} characters`
    : (sourceLength ? `${sourceLength} characters ready` : "No text yet");
  elements.copyButton.disabled = !hasRun || (!outputTitle && !outputBody);
  elements.downloadButton.disabled = !hasRun || (!outputTitle && !outputBody);
}

function updateInputDetails() {
  const count = elements.bodyInput.value.length;
  elements.characterCount.textContent = `${count.toLocaleString()} ${count === 1 ? "character" : "characters"}`;
  if (!isRunning) {
    elements.copyButton.disabled = !hasRun || (!outputTitle && !outputBody);
    elements.downloadButton.disabled = !hasRun || (!outputTitle && !outputBody);
  }
}

function setMlaState() {
  const isMla = elements.mlaFormat.checked;
  elements.fontInput.disabled = isMla;
  elements.lineSpacing.disabled = isMla;
  elements.customSpacing.disabled = isMla;
  elements.bodySize.disabled = isMla;
  setCustomSpacingVisibility();
  renderPreview();
}

function setCustomSpacingVisibility() {
  const visible = elements.lineSpacing.value === "custom" && !elements.mlaFormat.checked;
  elements.customSpacingWrap.hidden = !visible;
  elements.customSpacing.hidden = !visible;
}

function sleep(milliseconds, id) {
  return new Promise((resolve) => {
    resolvePause = resolve;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      resolvePause = null;
      resolve(id === runId);
    }, milliseconds);
  });
}

function typingDelay(character, wpm) {
  const base = 60 / (wpm * 5);
  const first = Math.max(Number.EPSILON, Math.random());
  const second = Math.random();
  const normal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  let delay = Math.max(0.02, base + normal * base * 0.35);
  if (".,!?;:\n".includes(character)) delay += 0.15 + Math.random() * 0.45;
  else if (character === " " && Math.random() < 0.08) delay += 0.3 + Math.random() * 0.9;
  return delay * 1000;
}

function adjacentTypo(character) {
  const options = NEIGHBORS[character.toLowerCase()];
  if (!options) return null;
  const typo = options[Math.floor(Math.random() * options.length)];
  return character === character.toUpperCase() ? typo.toUpperCase() : typo;
}

function parseDocumentId(input) {
  const value = input.trim();
  const match = value.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : value;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) {
    throw new Error("Enter a valid Google Docs URL or document ID.");
  }
  return id;
}

function connectGoogle() {
  if (!IS_PRODUCTION_ORIGIN) {
    const error = new Error(`Google sign-in is only available from ${PRODUCTION_ORIGIN}. Open the hosted app to connect.`);
    setGoogleStatus("Use the hosted app to connect", `Google authorization is restricted to ${PRODUCTION_ORIGIN}.`);
    showToast(error.message);
    return Promise.reject(error);
  }

  if (!window.google?.accounts?.oauth2) {
    const error = new Error("Google sign-in did not load. Check your connection, reload the page, and try again.");
    setGoogleStatus("Google sign-in unavailable", error.message);
    showToast(error.message);
    return Promise.reject(error);
  }

  setGoogleStatus("Waiting for Google", "Complete the authorization in the Google sign-in window.");
  elements.googleConnectButton.disabled = true;

  return new Promise((resolve, reject) => {
    try {
      oauthClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/documents",
        callback: (response) => {
          elements.googleConnectButton.disabled = false;
          if (response.error || !response.access_token) {
            accessToken = null;
            const error = new Error(response.error_description || response.error || "Google authorization failed.");
            setGoogleStatus("Not connected", error.message);
            showToast(error.message);
            reject(error);
            return;
          }
          accessToken = response.access_token;
          accessTokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          elements.googleConnectButton.textContent = "Reconnect";
          setGoogleStatus("Google account connected", "Access is held in memory and expires automatically.");
          resolve();
        },
        error_callback: (error) => {
          elements.googleConnectButton.disabled = false;
          const message = error?.message || "The Google sign-in window could not open.";
          setGoogleStatus("Not connected", message);
          showToast(message);
          reject(new Error(message));
        },
      });
      oauthClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    } catch (error) {
      elements.googleConnectButton.disabled = false;
      setGoogleStatus("Not connected", error.message);
      showToast(error.message);
      reject(error);
    }
  });
}

function requireAccessToken() {
  if (!accessToken) {
    throw new Error("Connect your Google account before starting a document write.");
  }
  if (Date.now() >= accessTokenExpiresAt) {
    accessToken = null;
    elements.googleConnectButton.textContent = "Connect Google";
    setGoogleStatus("Google connection expired", "Reconnect your Google account to continue.");
    throw new Error("Your Google authorization has expired. Reconnect your Google account and try again.");
  }
  return accessToken;
}

async function docsRequest(documentId, method, body) {
  const token = requireAccessToken();
  let response;
  try {
    response = await fetch(`${DOCS_API}/${encodeURIComponent(documentId)}${method === "POST" ? ":batchUpdate" : ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`Could not reach the Google Docs API: ${error.message}`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Google Docs returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    if (response.status === 401) {
      accessToken = null;
      elements.googleConnectButton.textContent = "Connect Google";
      setGoogleStatus("Google connection expired", "Reconnect your Google account to continue.");
    }
    const message = result.error?.message || `Google Docs API error (HTTP ${response.status}).`;
    throw new Error(response.status === 401 ? `${message} Reconnect your Google account.` : message);
  }
  return result;
}

function documentEndIndex(document) {
  const content = document.body?.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("This Google Doc has no editable body content.");
  }
  const last = content[content.length - 1];
  if (!Number.isInteger(last.endIndex)) {
    throw new Error("Could not determine where to insert text in this Google Doc.");
  }
  return last.endIndex;
}

async function loadDocument() {
  const documentId = parseDocumentId(elements.documentInput.value);
  const document = await docsRequest(documentId, "GET");
  const endIndex = documentEndIndex(document);
  setGoogleStatus("Google account connected", `Document ready: ${document.title || "Untitled"}`);
  return { documentId, document, endIndex };
}

function documentText(settings) {
  return `${settings.title ? `${settings.title}\n\n` : ""}${settings.text}`;
}

function characterSegments(text, maximumLength) {
  const segments = [];
  let current = "";
  for (const character of text) {
    if (current && current.length + character.length > maximumLength) {
      segments.push(current);
      current = "";
    }
    current += character;
  }
  if (current) segments.push(current);
  return segments;
}

function makeTitleFormattingRequests(settings, startIndex) {
  const titleLength = settings.title.length;
  const requests = [];
  const font = settings.font;
  if (!titleLength) return requests;
  const titleStyle = {
    fontSize: { magnitude: settings.titleCustomSize ? settings.titleSize : 14, unit: "PT" },
    ...(font ? { weightedFontFamily: { fontFamily: font } } : {}),
    bold: settings.titleBold,
  };
  requests.push({
    updateTextStyle: {
      range: { startIndex, endIndex: startIndex + titleLength },
      textStyle: titleStyle,
      fields: Object.keys(titleStyle).join(","),
    },
  });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex, endIndex: startIndex + titleLength },
      paragraphStyle: { alignment: settings.titleCenter ? "CENTER" : "START" },
      fields: "alignment",
    },
  });
  return requests;
}

function makeBodyFormattingRequests(settings, bodyStart, bodyLength) {
  const requests = [];
  const font = settings.font;
  const bodyEnd = bodyStart + bodyLength;

  if (bodyLength > 0) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: bodyStart, endIndex: bodyEnd },
        textStyle: {
          fontSize: { magnitude: settings.isMla ? 12 : settings.bodySize, unit: "PT" },
          ...(font ? { weightedFontFamily: { fontFamily: font } } : {}),
        },
        fields: font ? "fontSize,weightedFontFamily" : "fontSize",
      },
    });
    const paragraphStyle = {
      ...(settings.keepLineSpacing ? {} : { lineSpacing: settings.spacing * 100 }),
      indentFirstLine: { magnitude: settings.indent ? 36 : 0, unit: "PT" },
    };
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: bodyStart, endIndex: bodyEnd },
        paragraphStyle,
        fields: settings.keepLineSpacing ? "indentFirstLine" : "lineSpacing,indentFirstLine",
      },
    });
  }
  return requests;
}

async function writeToDocument(settings, id) {
  const { documentId, document, endIndex } = await loadDocument();
  if (id !== runId) return false;
  let insertionIndex = endIndex - 1;
  const mode = elements.insertMode.value;
  const prefix = mode === "append" && endIndex > 2 ? "\n" : "";

  if (mode === "replace") {
    const confirmed = window.confirm("Replace all existing body content in this Google Doc? This change cannot be automatically undone.");
    if (!confirmed) throw new Error("Replace cancelled. Choose append or confirm replacement to continue.");
    insertionIndex = 1;
  }

  const titleContent = settings.title ? `${settings.title}\n\n` : "";
  const text = prefix + titleContent + settings.text;
  if (!text.length) throw new Error("There is no document text to insert.");

  const charactersPerBatch = Math.max(5, Math.min(70, Math.ceil(settings.wpm / 10)));
  let insertedIndex = insertionIndex;
  let totalTyped = 0;
  renderedDocumentChars = 0;

  if (titleContent) {
    if (id !== runId) return false;
    setState("running", "Writing to Google Docs");
    const requests = [];
    if (mode === "replace" && endIndex - 1 > 1) {
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    requests.push({ insertText: { location: { index: insertedIndex }, text: prefix + titleContent } });
    requests.push(...makeTitleFormattingRequests(settings, insertedIndex + prefix.length));
    await docsRequest(documentId, "POST", { requests });
    hasRemoteChanges = true;
    insertedIndex += prefix.length + titleContent.length;
    totalTyped = prefix.length + titleContent.length;
    renderedDocumentChars = prefix.length;

    await revealInsertedText(settings, id, text, totalTyped, prefix.length);
    if (id !== runId) return false;
  }

  const bodyOffset = titleContent ? prefix.length + titleContent.length : 0;
  const bodyText = text.slice(bodyOffset);
  const segments = characterSegments(bodyText, charactersPerBatch);
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (id !== runId) return false;
    setState("running", "Writing to Google Docs");
    const requests = [];
    const sourceStart = totalTyped;
    if (!titleContent && mode === "replace" && segmentIndex === 0 && endIndex - 1 > 1) {
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    requests.push({ insertText: { location: { index: insertedIndex }, text: segment } });
    const prefixInSegment = Math.max(0, Math.min(segment.length, prefix.length - sourceStart));
    const bodyLength = segment.length - prefixInSegment;
    if (bodyLength > 0) {
      requests.push(...makeBodyFormattingRequests(
        settings,
        insertedIndex + prefixInSegment,
        bodyLength,
      ));
    }
    await docsRequest(documentId, "POST", { requests });
    hasRemoteChanges = true;
    insertedIndex += segment.length;
    totalTyped += segment.length;

    await revealInsertedText(settings, id, text, totalTyped, prefix.length);
    if (id !== runId) return false;
  }
  return true;
}

async function revealInsertedText(settings, id, fullText, targetLength, prefixLength) {
  const slice = fullText.slice(renderedDocumentChars, targetLength);
  for (const character of slice) {
    if (id !== runId) return;
    const sourcePosition = renderedDocumentChars;
    if (sourcePosition < prefixLength) {
      renderedDocumentChars += character.length;
      continue;
    }
    if (settings.title &&
        sourcePosition < prefixLength + settings.title.length) {
      outputTitle += character;
    } else if (settings.title &&
        sourcePosition === prefixLength + settings.title.length) {
      outputBody = "\n";
    } else {
      const bodyPosition = sourcePosition - prefixLength - (settings.title ? settings.title.length + 2 : 0);
      if (settings.indent && (bodyPosition === 0 || settings.text[bodyPosition - 1] === "\n")) outputBody += "\t";
      outputBody += character;
    }
    renderedDocumentChars += character.length;
    renderPreview(settings);
    let delay = typingDelay(character, settings.wpm);
    if (adjacentTypo(character) && Math.random() < settings.errorRate) delay += 250 + Math.random() * 450;
    if (!await sleep(delay, id)) return;
  }
}

function setRunning(running) {
  isRunning = running;
  elements.startButton.disabled = running;
  elements.googleConnectButton.disabled = running;
  elements.stopButton.disabled = !running;
  elements.stopButton.style.display = running ? "inline-flex" : "";
  elements.typingCaret.hidden = !running;
}

async function startTyping() {
  if (isRunning) return;
  let settings;
  try {
    settings = getSettings();
    if (!settings.text.trim()) throw new Error("Add some body text before you start.");
    parseDocumentId(elements.documentInput.value);
    requireAccessToken();
  } catch (error) {
    showToast(error.message);
    say(error.message);
    if (!elements.documentInput.value.trim()) elements.documentInput.focus();
    else if (!accessToken) elements.googleConnectButton.focus();
    return;
  }

  const id = ++runId;
  outputTitle = "";
  outputBody = "";
  renderedDocumentChars = 0;
  hasRemoteChanges = false;
  hasRun = true;
  setRunning(true);
  elements.actionHint.innerHTML = '<span class="hint-dot" aria-hidden="true"></span> Connecting to your document. Stop at any time.';
  setState("running", "Getting ready");
  renderPreview(settings);

  try {
    for (let remaining = settings.delay; remaining > 0; remaining -= 1) {
      if (id !== runId) return;
      setState("running", `Starting in ${remaining}s`);
      say(`Starting in ${remaining} seconds`);
      if (!await sleep(1000, id)) return;
    }

    const completed = await writeToDocument(settings, id);
    if (!completed || id !== runId) return;
    setRunning(false);
    setState("done", "Written to Google Docs");
    elements.actionHint.innerHTML = '<span class="hint-dot" aria-hidden="true"></span> Your text was written directly to the selected Google Doc.';
    elements.copyButton.disabled = false;
    elements.downloadButton.disabled = false;
    elements.progressLabel.textContent = `${documentText(settings).length} characters written`;
    say("Typing complete. Text was written to Google Docs.");
  } catch (error) {
    if (id !== runId) return;
    setRunning(false);
    setState("stopped", "Could not finish");
    elements.actionHint.textContent = outputTitle || outputBody
      ? "The API stopped before completing the write. Some text may already be in the Google Doc."
      : "Nothing was written. Review the error and try again.";
    if (hasRemoteChanges && !outputTitle && !outputBody) {
      elements.actionHint.textContent = "The write was interrupted. Some text may already be in the Google Doc; review it before trying again.";
    }
    showToast(error.message);
    say(error.message);
  }
}

function stopTyping() {
  if (!isRunning) return;
  runId += 1;
  if (timeoutId !== null) clearTimeout(timeoutId);
  timeoutId = null;
  if (resolvePause) {
    const resolve = resolvePause;
    resolvePause = null;
    resolve(false);
  }
  setRunning(false);
  setState("stopped", "Stopped");
  elements.actionHint.textContent = hasRemoteChanges
    ? "Typing stopped. A partial write may remain in your Google Doc; review it before starting again."
    : "Typing stopped before any text was written. You can start again when ready.";
  renderPreview();
  say("Typing stopped");
}

function completedText() {
  return `${outputTitle}${outputBody}`;
}

async function copyText() {
  const text = completedText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    if (!copied) {
      showToast("Could not copy. Select the preview text and copy it manually.");
      return;
    }
    showToast("Copied to clipboard");
  }
}

function downloadText() {
  const text = completedText();
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "human-typer-document.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearText() {
  if (isRunning) stopTyping();
  elements.titleInput.value = "";
  elements.bodyInput.value = "";
  outputTitle = "";
  outputBody = "";
  renderedDocumentChars = 0;
  hasRun = false;
  elements.previewTitle.textContent = "";
  elements.previewTitle.hidden = true;
  elements.previewBody.innerHTML = '<span class="preview-placeholder">Your document will appear here. Add some text to get started.</span>';
  elements.progressLabel.textContent = "No text yet";
  elements.copyButton.disabled = true;
  elements.downloadButton.disabled = true;
  elements.actionHint.innerHTML = '<span class="hint-dot" aria-hidden="true"></span> Connect Google, choose a document, then start typing.';
  setState("", "Ready when you are");
  updateInputDetails();
}

for (const [range, output] of [
  [elements.speedRange, elements.speedValue],
  [elements.mistakesRange, elements.mistakesValue],
  [elements.delayRange, elements.delayValue],
]) {
  range.addEventListener("input", () => { output.value = range.value; });
}

elements.titleCustomSize.addEventListener("change", () => {
  elements.titleSize.disabled = !elements.titleCustomSize.checked;
  renderPreview();
});
elements.mlaFormat.addEventListener("change", setMlaState);
elements.lineSpacing.addEventListener("change", () => {
  setCustomSpacingVisibility();
  renderPreview();
});
elements.fontInput.addEventListener("input", () => renderPreview());
elements.bodySize.addEventListener("input", () => renderPreview());
elements.titleSize.addEventListener("input", () => renderPreview());
elements.titleBold.addEventListener("change", () => renderPreview());
elements.titleCenter.addEventListener("change", () => renderPreview());
elements.indentParagraphs.addEventListener("change", () => renderPreview());
elements.titleInput.addEventListener("input", updateInputDetails);
elements.bodyInput.addEventListener("input", updateInputDetails);
elements.insertMode.addEventListener("change", () => {
  const replacing = elements.insertMode.value === "replace";
  elements.documentWarning.hidden = !replacing;
  if (replacing) elements.documentWarning.textContent = "Replacing deletes the existing document body before inserting your text. You will be asked to confirm before anything is deleted.";
});
elements.googleConnectButton.addEventListener("click", () => {
  connectGoogle().catch((error) => say(error.message));
});
elements.startButton.addEventListener("click", startTyping);
elements.stopButton.addEventListener("click", stopTyping);
elements.copyButton.addEventListener("click", copyText);
elements.downloadButton.addEventListener("click", downloadText);
elements.clearButton.addEventListener("click", clearText);

elements.titleSize.disabled = true;
elements.stopButton.style.display = "none";
if (!IS_PRODUCTION_ORIGIN) {
  elements.googleConnectButton.hidden = true;
  elements.clientConfig.hidden = true;
  elements.hostedSiteLink.hidden = false;
  setGoogleStatus("Google sign-in uses the hosted app", `Open ${PRODUCTION_ORIGIN} to connect your account.`);
}
setMlaState();
updateInputDetails();
