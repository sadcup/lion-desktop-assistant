FROM vllm/vllm-openai:v0.23.0
RUN python3 -m pip install --break-system-packages --no-cache-dir \
    'transformers==5.20.2' 'soundfile==0.13.1'
WORKDIR /app
COPY server.py /app/server.py
ENTRYPOINT ["python3","-u","/app/server.py"]
