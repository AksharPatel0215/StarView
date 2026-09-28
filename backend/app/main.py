from fastapi import FastAPI


app = FastAPI(title="StarView API")


@app.get("/")
def root():
    return {"message": "StarView API"}