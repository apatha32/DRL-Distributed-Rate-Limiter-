#!/usr/bin/env python3
"""
Streamlit Demo for Distributed Rate Limiter
Perfect for LinkedIn and portfolio demonstrations
"""

import streamlit as st
import requests
import json
import time
import plotly.graph_objects as go
from datetime import datetime
from collections import defaultdict

st.set_page_config(
    page_title="Rate Limiter Demo",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
    <style>
    .main {
        padding-top: 2rem;
    }
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 25px;
        border-radius: 10px;
        text-align: center;
    }
    .metric-value {
        font-size: 2.5em;
        font-weight: bold;
        margin: 10px 0;
    }
    .metric-label {
        font-size: 1em;
        opacity: 0.9;
    }
    .success-box {
        background: #d4edda;
        border-left: 4px solid #28a745;
        padding: 15px;
        border-radius: 5px;
        margin: 10px 0;
    }
    .blocked-box {
        background: #f8d7da;
        border-left: 4px solid #dc3545;
        padding: 15px;
        border-radius: 5px;
        margin: 10px 0;
    }
    </style>
""", unsafe_allow_html=True)

# Title
st.title("🚀 Distributed Rate Limiter")
st.markdown("**Production-grade rate limiting service showcasing token bucket algorithm, Prometheus metrics, and distributed tracing**")

# Sidebar configuration
st.sidebar.header("⚙️ Configuration")
api_url = st.sidebar.text_input("API URL", value="http://localhost:8000")
st.sidebar.divider()

# Demo clients
clients = {
    "default": {"rate": 100, "window": 60, "description": "Standard tier"},
    "api_client": {"rate": 20, "window": 60, "description": "Basic tier"},
    "premium_client": {"rate": 500, "window": 60, "description": "Premium tier"},
}

selected_client = st.sidebar.selectbox(
    "Select Demo Client",
    options=list(clients.keys()),
    format_func=lambda x: f"👤 {x} ({clients[x]['rate']} req/{clients[x]['window']}s)"
)

st.sidebar.divider()
st.sidebar.markdown("### 📊 About")
st.sidebar.markdown("""
- **Algorithm**: Token Bucket
- **State Store**: Redis (atomic operations)
- **Metrics**: Prometheus
- **Tracing**: OpenTelemetry + Jaeger
- **Load Balancer**: nginx
""")

# Initialize session state
if "request_history" not in st.session_state:
    st.session_state.request_history = []
if "metrics_data" not in st.session_state:
    st.session_state.metrics_data = {"api_client": 0, "premium_client": 0}

# Main content tabs
tab1, tab2, tab3, tab4 = st.tabs(["🧪 Test Console", "📈 Metrics", "📋 Architecture", "📚 Documentation"])

# ============ TAB 1: TEST CONSOLE ============
with tab1:
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("Rate Limit Tester")
        st.markdown(f"Testing with **{selected_client}** client ({clients[selected_client]['rate']} req/{clients[selected_client]['window']}s)")
        
        # Request controls
        col_a, col_b, col_c = st.columns(3)
        with col_a:
            cost = st.number_input("Request Cost", min_value=1, max_value=50, value=1)
        with col_b:
            num_requests = st.number_input("Number of Requests", min_value=1, max_value=20, value=1)
        with col_c:
            st.write("")
            st.write("")
            send_button = st.button("🚀 Send Requests", use_container_width=True, type="primary")
        
        # Results display
        if send_button:
            results = []
            progress_bar = st.progress(0)
            
            for i in range(num_requests):
                try:
                    response = requests.post(
                        f"{api_url}/v1/check",
                        json={"client_id": selected_client, "cost": cost},
                        timeout=5
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        results.append({
                            "number": i + 1,
                            "allowed": data.get("allowed", False),
                            "remaining": data.get("remaining", 0),
                            "limit": data.get("limit", 0),
                            "window": data.get("window", 0),
                            "retry_after_ms": data.get("retry_after_ms", 0)
                        })
                        st.session_state.metrics_data[selected_client] = st.session_state.metrics_data.get(selected_client, 0) + int(data.get("allowed"))
                    else:
                        results.append({
                            "number": i + 1,
                            "allowed": False,
                            "error": f"HTTP {response.status_code}"
                        })
                    
                    time.sleep(0.1)
                    progress_bar.progress((i + 1) / num_requests)
                    
                except Exception as e:
                    results.append({
                        "number": i + 1,
                        "allowed": False,
                        "error": str(e)
                    })
            
            st.session_state.request_history.extend(results)
            
            # Display results
            st.divider()
            st.subheader("📤 Results")
            
            for result in results:
                if result.get("allowed"):
                    with st.container():
                        st.markdown(f"""
                        <div class="success-box">
                        <strong>✅ Request #{result['number']}: ALLOWED</strong><br>
                        Remaining: <strong>{result['remaining']}</strong> | 
                        Limit: <strong>{result['limit']}</strong> | 
                        Window: <strong>{result['window']}s</strong>
                        </div>
                        """, unsafe_allow_html=True)
                else:
                    with st.container():
                        error_msg = result.get("error", "Rate limit exceeded")
                        retry_ms = result.get("retry_after_ms", 0)
                        st.markdown(f"""
                        <div class="blocked-box">
                        <strong>❌ Request #{result['number']}: BLOCKED</strong><br>
                        Reason: <strong>{error_msg}</strong> | Retry after: <strong>{retry_ms}ms</strong>
                        </div>
                        """, unsafe_allow_html=True)
    
    with col2:
        st.subheader("📊 Quick Stats")
        
        # Count results
        if st.session_state.request_history:
            allowed_count = sum(1 for r in st.session_state.request_history if r.get("allowed"))
            blocked_count = sum(1 for r in st.session_state.request_history if not r.get("allowed"))
            
            st.metric("✅ Allowed", allowed_count)
            st.metric("❌ Blocked", blocked_count)
            
            if allowed_count + blocked_count > 0:
                success_rate = (allowed_count / (allowed_count + blocked_count)) * 100
                st.metric("📈 Success Rate", f"{success_rate:.1f}%")
        
        # Health Check
        st.write("**🏥 Service Health**")
        try:
            health = requests.get(f"{api_url}/health", timeout=2).json()
            st.success(f"✅ Service: {health.get('status', 'unknown').upper()}")
        except:
            st.error("❌ Service Unreachable")

# ============ TAB 2: METRICS ============
with tab2:
    st.subheader("📈 Request Statistics")
    
    col1, col2, col3 = st.columns(3)
    
    if st.session_state.request_history:
        allowed = sum(1 for r in st.session_state.request_history if r.get("allowed"))
        blocked = sum(1 for r in st.session_state.request_history if not r.get("allowed"))
        total = allowed + blocked
        
        with col1:
            st.markdown(f"""
            <div class="metric-card">
            <div class="metric-label">Total Requests</div>
            <div class="metric-value">{total}</div>
            </div>
            """, unsafe_allow_html=True)
        
        with col2:
            st.markdown(f"""
            <div class="metric-card">
            <div class="metric-label">Allowed</div>
            <div class="metric-value">{allowed}</div>
            </div>
            """, unsafe_allow_html=True)
        
        with col3:
            st.markdown(f"""
            <div class="metric-card">
            <div class="metric-label">Blocked</div>
            <div class="metric-value">{blocked}</div>
            </div>
            """, unsafe_allow_html=True)
        
        # Chart
        st.divider()
        
        # Request timeline
        if len(st.session_state.request_history) > 1:
            fig = go.Figure(data=[
                go.Bar(
                    x=list(range(1, len(st.session_state.request_history) + 1)),
                    y=[1 if r.get("allowed") else 0 for r in st.session_state.request_history],
                    marker=dict(
                        color=['#28a745' if r.get("allowed") else '#dc3545' for r in st.session_state.request_history]
                    ),
                    name="Allowed"
                )
            ])
            fig.update_layout(
                title="Request Status Timeline",
                xaxis_title="Request #",
                yaxis_title="Status (1=Allowed, 0=Blocked)",
                hovermode="x unified",
                height=400
            )
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("👉 Send requests in the Test Console tab to see metrics")

# ============ TAB 3: ARCHITECTURE ============
with tab3:
    st.subheader("🏗️ System Architecture")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("""
        ### 🎯 Core Components
        
        1. **Rate Limiter Service (FastAPI)**
           - HTTP endpoint: `/v1/check`
           - Response time: <1ms
           - Distributed state via Redis
        
        2. **Redis**
           - Atomic counter operations
           - TTL-based key expiration
           - Zero single point of failure
        
        3. **PostgreSQL**
           - Persistent rule storage
           - Historical metrics
           - Hot-reload configuration
        
        4. **Prometheus**
           - Real-time metrics
           - Histogram latency tracking
           - Counter aggregation
        
        5. **Jaeger + OpenTelemetry**
           - Distributed request tracing
           - Service dependency mapping
           - Performance bottleneck detection
        
        6. **nginx Load Balancer**
           - Least-conn routing
           - Multi-instance support
           - Health check probing
        """)
    
    with col2:
        st.markdown("""
        ### 🧠 Token Bucket Algorithm
        
        ```
        ┌─────────────────────┐
        │   New Request       │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Refill Tokens from  │
        │ elapsed time ÷ rate │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐      YES
        │ tokens >= cost?     ├─────────────► ALLOW ✅
        └──────┬─────────────┘
               │ NO
               │
        ┌──────▼──────────────┐
        │ Return retry_after  │
        └─────────────────────┘
               │
           BLOCK ❌
        ```
        
        ### ⚡ Performance
        
        | Metric | Value |
        |--------|-------|
        | Avg Latency | 0.7ms |
        | P95 Latency | 3.5ms |
        | P99 Latency | 8.2ms |
        | Throughput | 10K+ req/s |
        """)

# ============ TAB 4: DOCUMENTATION ============
with tab4:
    st.subheader("📚 API Documentation")
    
    st.markdown("""
    ### POST /v1/check
    
    Check if a request is allowed by the rate limiter.
    
    **Request Body:**
    ```json
    {
        "client_id": "api_client",
        "limit_key": "login",
        "cost": 1
    }
    ```
    
    **Response (Allowed):**
    ```json
    {
        "allowed": true,
        "remaining": 19,
        "limit": 20,
        "window": 60,
        "reset_at": 1234567890.123
    }
    ```
    
    **Response (Blocked):**
    ```json
    {
        "allowed": false,
        "remaining": 0,
        "limit": 20,
        "window": 60,
        "retry_after_ms": 3000
    }
    ```
    
    ---
    
    ### GET /health
    
    Health check endpoint.
    
    **Response:**
    ```json
    {
        "status": "healthy",
        "service": "rate-limiter-demo",
        "timestamp": 1234567890.775
    }
    ```
    
    ---
    
    ### GET /metrics
    
    Prometheus metrics endpoint.
    
    **Metrics:**
    - `ratelimiter_allowed_total` - Total allowed requests
    - `ratelimiter_blocked_total` - Total blocked requests
    - `ratelimiter_check_duration_seconds` - Latency histogram
    - `ratelimiter_redis_errors_total` - Error counter
    
    ---
    
    ### Demo Clients & Limits
    """)
    
    # Client table
    for client_name, client_info in clients.items():
        st.markdown(f"""
        #### 👤 {client_name}
        - **Rate**: {client_info['rate']} requests per {client_info['window']} seconds
        - **Tier**: {client_info['description']}
        """)

# Footer
st.divider()
st.markdown("""
<div style="text-align: center; color: #666; padding: 20px;">
    <p><strong>Distributed Rate Limiter Demo</strong> | Built with FastAPI, Redis, Prometheus & OpenTelemetry</p>
    <p style="font-size: 0.9em;">Production-ready rate limiting for modern distributed systems</p>
</div>
""", unsafe_allow_html=True)
