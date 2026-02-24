import { useState, useEffect } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [sessionId, setSessionId] = useState(() => {
    const existing = localStorage.getItem("sessionId");
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem("sessionId", newId);
    return newId;
  });

  useEffect(() => {
  axios
    .get(`http://localhost:5000/api/conversations/${sessionId}`)
    .then(res => {
      if (Array.isArray(res.data)) {
        setMessages(res.data);
      } else {
        setMessages([]);
      }
    })
    .catch(err => {
      console.error("Conversation fetch error:", err);
      setMessages([]);
    });
}, [sessionId]);
//   useEffect(() => {
//     axios
//       .get(`http://localhost:5000/api/conversations/${sessionId}`)
//       .then(res => setMessages(res.data))
//       .catch(err => console.log(err));
//   }, [sessionId]);
// const sendMessage = async () => {
//   if (!message.trim()) return;

//   setLoading(true);

//   try {
//     const res = await axios.post("http://localhost:5000/api/chat", {
//       sessionId,
//       message
//     });

//     if (res.data && res.data.reply) {
//       setMessages(prev => [
//         ...prev,
//         { role: "user", content: message },
//         { role: "assistant", content: res.data.reply }
//       ]);
//     }

//     setMessage("");
//   } catch (err) {
//     console.error("API Error:", err.response?.data || err.message);
//     // ❌ REMOVE alert
//     // alert("Error sending message");
//   }

//   setLoading(false);
// };
const sendMessage = async () => {
  if (!message.trim()) return;

  const userMessage = { role: "user", content: message };

  // Immediately show user message
  setMessages(prev => [...prev, userMessage]);

  setLoading(true);

  try {
    const res = await axios.post("http://localhost:5000/api/chat", {
      sessionId,
      message
    });

    const assistantMessage = {
      role: "assistant",
      content: res.data.reply
    };

    setMessages(prev => [...prev, assistantMessage]);

  } catch (err) {
    console.error(err);
  }

  setMessage("");
  setLoading(false);
};
//   const sendMessage = async () => {
//     if (!message.trim()) return;

//     setLoading(true);

//     try {
//       const res = await axios.post("http://localhost:5000/api/chat", {
//         sessionId,
//         message
//       });

//       setMessages(prev => [
//         ...prev,
//         { role: "user", content: message },
//         { role: "assistant", content: res.data.reply }
//       ]);

//       setMessage("");
//     } catch (err) {
//       alert("Error sending message");
//     }

//     setLoading(false);
//   };

  const newChat = () => {
    const newId = uuidv4();
    localStorage.setItem("sessionId", newId);
    setSessionId(newId);
    setMessages([]);
  };

  return (
    <div className="app">
      <div className="chat-container">
        <div className="header">
          <h2>🤖 AI Support Assistant</h2>
          <button className="new-chat-btn" onClick={newChat}>
            New Chat
          </button>
        </div>

        <div className="chat-box">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {loading && <div className="typing">Assistant is typing...</div>}
        </div>

        <div className="input-box">
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Ask something..."
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>

      <footer className="footer">
        Devloped by Sandhya D
      </footer>
    </div>
  );
}

export default App;