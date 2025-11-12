from agno.vectordb.chroma import ChromaDb
from agno.knowledge.embedder.sentence_transformer import SentenceTransformerEmbedder
from django.conf import settings

def get_vector_db():
    """Return a configured ChromaDB client for RAG."""
    return ChromaDb(
        collection="job_screening",
        path=settings.VECTOR_DB_PATH,
        persistent_client=True,
        embedder=SentenceTransformerEmbedder(dimensions=384, id=settings.EMBEDDING_MODEL),
    )