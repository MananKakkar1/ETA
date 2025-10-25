import chromadb

client = chromadb.Client()  # Initialize the ChromaDB client
db = client.get_or_create_collection(name="eta_collection")  # Create or get a collection named "eta_collection"
