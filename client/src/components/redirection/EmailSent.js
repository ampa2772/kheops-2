import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const EmailSent = () => {
  const location = useLocation();
  const email = location.state.email;

  const getMailProviderLink = (email) => {
    const domain = email.split("@")[1].toLowerCase();
    const mailProviders = {
      "gmail.com": "https://mail.google.com",
      "yahoo.com": "https://mail.yahoo.com",
      "outlook.com": "https://outlook.live.com",
      "hotmail.com": "https://outlook.live.com",
      "wanadoo.fr": "https://www.orange.fr/portail",
      // Ajoutez d'autres fournisseurs de messagerie ici
    };

    return mailProviders[domain] || null;
  };

  const getResponsiveTextStyle = () => {
    return {
      fontSize: "1.1rem",
      marginBottom: "1rem",
      textAlign: "center",
      maxWidth: window.innerWidth > 768 ? "30%" : "70%",
      margin: "5px auto",
    };
  };

  const [textStyle, setTextStyle] = useState(getResponsiveTextStyle());

  useEffect(() => {
    const handleResize = () => {
      setTextStyle(getResponsiveTextStyle());
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const mailProviderLink = getMailProviderLink(email);

  const containerStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "1rem",
  };

  const titleStyle = {
    fontSize: "2rem",
    marginBottom: "1rem",
  };

  const linkStyle = {
    color: "#007bff",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Email envoyé !</h1>
      <p style={textStyle}>
        Nous avons envoyé un e-mail contenant un lien pour réinitialiser votre
        mot de passe à
      </p>
      <p style={{ color: "blue" }}>{email}</p>
      <p style={textStyle}>
        {" "}
        Veuillez vérifier votre boîte de réception et suivre les instructions
        pour réinitialiser votre mot de passe.
      </p>
      {mailProviderLink && (
        <p style={textStyle}>
          <a
            href={mailProviderLink}
            target="_blank"
            rel="noreferrer"
            style={linkStyle}
          >
            Accédez à votre boîte de réception
          </a>
        </p>
      )}
    </div>
  );
};

export default EmailSent;
