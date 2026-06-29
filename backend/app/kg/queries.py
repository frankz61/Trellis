"""All Cypher in one place."""

CONSTRAINTS = [
    "CREATE CONSTRAINT learner_id IF NOT EXISTS FOR (l:Learner) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT word_lemma IF NOT EXISTS FOR (w:Word) REQUIRE w.lemma IS UNIQUE",
    "CREATE CONSTRAINT grammar_nm IF NOT EXISTS FOR (g:GrammarPoint) REQUIRE g.name IS UNIQUE",
    "CREATE CONSTRAINT mistake_id IF NOT EXISTS FOR (m:Mistake) REQUIRE m.id IS UNIQUE",
    "CREATE INDEX word_cefr IF NOT EXISTS FOR (w:Word) ON (w.cefr)",
]

UPSERT_MISTAKE = """
MERGE (l:Learner {id:$uid})
CREATE (m:Mistake {id:$mid, original_text:$orig, corrected_text:$corr,
                   mistake_type:$type, explanation:$exp, created_at:datetime()})
MERGE (g:GrammarPoint {name:$grammar})
MERGE (l)-[:MADE]->(m)
MERGE (m)-[:OF_TYPE]->(g)
MERGE (l)-[w:WEAK_AT]->(g)
  ON CREATE SET w.count=1, w.updated_at=datetime()
  ON MATCH  SET w.count=w.count+1, w.updated_at=datetime()
"""

UPSERT_WORD_KNOWN = """
MERGE (l:Learner {id:$uid})
MERGE (w:Word {lemma:$lemma})
  ON CREATE SET w.meaning_cn=$meaning
MERGE (l)-[k:KNOWS]->(w)
  ON CREATE SET k.mastery_level=1, k.review_count=0, k.last_reviewed_at=datetime()
"""

GET_WEAK_POINTS = """
MATCH (l:Learner {id:$uid})-[w:WEAK_AT]->(g:GrammarPoint)
RETURN g.name AS name, w.count AS count ORDER BY w.count DESC LIMIT 10
"""

GET_DUE_REVIEWS = """
MATCH (l:Learner {id:$uid})-[w:WEAK_AT]->(g:GrammarPoint)
RETURN g.name AS item, 'grammar' AS kind, w.count AS weight
ORDER BY w.count DESC LIMIT 3
UNION
MATCH (l:Learner {id:$uid})-[k:KNOWS]->(wd:Word)
WHERE k.mastery_level < 3
RETURN wd.lemma AS item, 'word' AS kind, (3-k.mastery_level) AS weight
ORDER BY weight DESC LIMIT 2
"""

LIST_VOCAB = """
MATCH (l:Learner {id:$uid})-[k:KNOWS]->(w:Word)
RETURN w.lemma AS lemma, w.meaning_cn AS meaning_cn,
       k.mastery_level AS mastery_level, k.review_count AS review_count
ORDER BY k.last_reviewed_at DESC
"""

LIST_MISTAKES = """
MATCH (l:Learner {id:$uid})-[:MADE]->(m:Mistake)
OPTIONAL MATCH (m)-[:OF_TYPE]->(g:GrammarPoint)
RETURN m.original_text AS original, m.corrected_text AS corrected,
       m.mistake_type AS type, m.explanation AS explanation, g.name AS grammar,
       m.created_at AS created_at
ORDER BY m.created_at DESC
"""

QUERY_WORD = """
MATCH (w:Word {lemma:$lemma})
OPTIONAL MATCH (w)-[:SYNONYM_OF]->(s:Word)
OPTIONAL MATCH (w)-[:ANTONYM_OF]->(a:Word)
RETURN w.lemma AS lemma, w.meaning_cn AS meaning_cn, w.cefr AS cefr,
       collect(DISTINCT s.lemma) AS synonyms, collect(DISTINCT a.lemma) AS antonyms
"""

# --- exercise persistence & mastery write-back ---

CREATE_EXERCISE_WORD = """
MERGE (w:Word {lemma:$target})
CREATE (e:Exercise {id:$eid, kind:$kind, prompt:$prompt, answer:$answer, created_at:datetime()})
MERGE (e)-[:TARGETS]->(w)
"""

CREATE_EXERCISE_GRAMMAR = """
MERGE (g:GrammarPoint {name:$target})
CREATE (e:Exercise {id:$eid, kind:$kind, prompt:$prompt, answer:$answer, created_at:datetime()})
MERGE (e)-[:TARGETS]->(g)
"""

GET_EXERCISE_TARGET = """
MATCH (e:Exercise {id:$eid})-[:TARGETS]->(t)
RETURN labels(t)[0] AS target_type, coalesce(t.lemma, t.name) AS target_key
"""

UPDATE_WORD_MASTERY = """
MERGE (l:Learner {id:$uid})
MERGE (w:Word {lemma:$key})
MERGE (l)-[k:KNOWS]->(w)
  ON CREATE SET k.mastery_level=1, k.review_count=0
SET k.mastery_level = CASE
      WHEN coalesce(k.mastery_level,1) + $delta > 5 THEN 5
      WHEN coalesce(k.mastery_level,1) + $delta < 0 THEN 0
      ELSE coalesce(k.mastery_level,1) + $delta END,
    k.review_count = coalesce(k.review_count,0) + 1,
    k.last_reviewed_at = datetime()
RETURN k.mastery_level AS new_mastery
"""

ADJUST_WEAK_POINT = """
MATCH (l:Learner {id:$uid})-[w:WEAK_AT]->(g:GrammarPoint {name:$key})
SET w.count = CASE WHEN w.count + $delta < 0 THEN 0 ELSE w.count + $delta END,
    w.updated_at = datetime()
RETURN w.count AS new_count
"""
