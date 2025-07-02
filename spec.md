
---

## 🧠 Idea

You're building a **Chrome extension that gives doctors real-time autocomplete suggestions**, powered by a large language model (LLM). It works anywhere they type, and gives context-aware completions like next words, full sentences, or phrases. It’s triggered manually (via Tab), so it stays in the background unless needed.

---

## 🎯 Motivation

Doctors spend hours writing medical content: notes, diagnoses, referrals, emails, summaries. It’s repetitive, mentally draining, and often done under time pressure. Tools like autocomplete can:

* **Reduce cognitive load**
* **Speed up documentation**
* **Increase consistency in wording and structure**
* **Let doctors focus more on patients, less on typing**

LLMs are now good enough to assist in real time, without being locked into specific EHRs or tools. This makes them perfect for an extension that works across systems.

---

## 🧰 What it does

* Detects where the doctor is typing (web form, EHR note, email, etc.)
* Uses the text as context to query an LLM (e.g. OpenAI’s GPT)
* Suggests the most likely next part of the text
* Inserts it when the doctor hits Tab

Example:

> **Doctor types**: "Patient has a history of type 2 diabetes and"
>
> **LLM suggests**: " is currently managed with metformin and lifestyle modifications."

---

## 📐 Scope

### Short term:

* Works on any website with editable text areas
* Suggests text continuations with a simple prompt
* Calls OpenAI API directly, with no backend yet
* Triggered manually (Tab), so low intrusion

### Medium term:

* Add backend to hide API key, log use, pre/post-process prompts
* Add privacy safeguards or local inference for sensitive data
* Let users fine-tune how suggestions work (length, tone, style)

### Long term:

* Integration with EHRs or clinical platforms
* Adapt suggestions to medical specialty or writing habits
* Expand to structured content (e.g. ICD codes, summaries)

---

## 🧩 Why a Chrome extension?

It works **everywhere**: whatever tool the doctor uses, as long as it runs in a browser. No need to change systems or ask for IT integration. It’s lightweight, customizable, and deployable at scale.

---

