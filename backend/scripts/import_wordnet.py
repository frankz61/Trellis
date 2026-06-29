"""Import a vocabulary graph from WordNet into Neo4j.

Source: NLTK WordNet + Open Multilingual WordNet (for Chinese glosses).
Writes :Word nodes and :SYNONYM_OF / :ANTONYM_OF relations.

Setup & run (from backend/):
    pip install nltk
    python -m scripts.import_wordnet                      # built-in seed list
    python -m scripts.import_wordnet data/wordlist.txt    # 'word' or 'word,CEFR' per line

Red line: imports authoritative WordNet relations only; does NOT use an LLM to
invent relations (keeps the graph trustworthy).
"""
from __future__ import annotations

import sys

from app.kg.neo4j_client import Neo4jClient

SEED_WORDS: list[str] = [
    "meticulous", "ubiquitous", "ambiguous", "candid", "diligent", "eloquent",
    "frugal", "gregarious", "impeccable", "lucid", "nostalgic", "pragmatic",
    "resilient", "scrupulous", "tenacious", "versatile", "abundant", "concise",
    "deliberate", "inevitable",
]

_UPSERT_WORD = """
MERGE (w:Word {lemma:$lemma})
SET w.pos=$pos, w.meaning_en=$meaning_en, w.meaning_cn=$meaning_cn,
    w.cefr=$cefr, w.source='wordnet'
"""

_LINK_SYNONYMS = """
MATCH (w:Word {lemma:$lemma})
UNWIND $names AS name
  MERGE (s:Word {lemma:name})
  MERGE (w)-[:SYNONYM_OF]->(s)
"""

_LINK_ANTONYMS = """
MATCH (w:Word {lemma:$lemma})
UNWIND $names AS name
  MERGE (a:Word {lemma:name})
  MERGE (w)-[:ANTONYM_OF]->(a)
"""


def _ensure_nltk() -> None:
    import nltk

    for pkg, path in (("wordnet", "corpora/wordnet"), ("omw-1.4", "corpora/omw-1.4")):
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(pkg)


def _word_info(word: str) -> dict | None:
    from nltk.corpus import wordnet as wn

    synsets = wn.synsets(word)
    if not synsets:
        return None
    primary = synsets[0]
    cmn: list[str] = []
    synonyms: set[str] = set()
    antonyms: set[str] = set()
    for s in synsets:
        try:
            cmn.extend(s.lemma_names("cmn"))
        except Exception:  # noqa: BLE001
            pass
        for lemma in s.lemmas():
            name = lemma.name().replace("_", " ")
            if name.lower() != word.lower():
                synonyms.add(name)
            for ant in lemma.antonyms():
                antonyms.add(ant.name().replace("_", " "))
    meaning_cn = "; ".join(dict.fromkeys(cmn))[:120]
    return {
        "lemma": word,
        "pos": primary.pos(),
        "meaning_en": primary.definition(),
        "meaning_cn": meaning_cn,
        "synonyms": sorted(synonyms)[:10],
        "antonyms": sorted(antonyms)[:10],
    }


def _load_wordlist(path: str) -> list[tuple[str, str | None]]:
    items: list[tuple[str, str | None]] = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "," in line:
                word, cefr = line.split(",", 1)
                items.append((word.strip(), cefr.strip() or None))
            else:
                items.append((line, None))
    return items


def run(words: list[tuple[str, str | None]]) -> None:
    _ensure_nltk()
    client = Neo4jClient.instance()
    client.init_constraints()
    imported = 0
    for word, cefr in words:
        info = _word_info(word)
        if info is None:
            print(f"  skip (not in WordNet): {word}")
            continue
        client.run(
            _UPSERT_WORD,
            lemma=info["lemma"],
            pos=info["pos"],
            meaning_en=info["meaning_en"],
            meaning_cn=info["meaning_cn"],
            cefr=cefr,
        )
        if info["synonyms"]:
            client.run(_LINK_SYNONYMS, lemma=info["lemma"], names=info["synonyms"])
        if info["antonyms"]:
            client.run(_LINK_ANTONYMS, lemma=info["lemma"], names=info["antonyms"])
        imported += 1
        print(f"  imported: {word} (syn={len(info['synonyms'])}, ant={len(info['antonyms'])})")
    print(f"done. imported {imported}/{len(words)} words.")


def main() -> None:
    if len(sys.argv) > 1:
        words = _load_wordlist(sys.argv[1])
    else:
        words = [(w, None) for w in SEED_WORDS]
    run(words)


if __name__ == "__main__":
    main()
