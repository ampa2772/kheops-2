import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BuildInfoSection = () => {
    const [buildInfo, setBuildInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchBuildInfo = () => {
        setLoading(true);
        setError(null);
        const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
        axios.get(`${apiUrl}/api/build-info`)
            .then(res => {
                setBuildInfo(res.data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchBuildInfo();
    }, []);

    if (loading) return <p>Chargement des informations de build...</p>;
    if (error) return <p style={{ color: '#f44336' }}>Erreur : {error}</p>;

    const statusColor = buildInfo.hashMatch === true ? '#4CAF50'
                      : buildInfo.hashMatch === false ? '#f44336'
                      : '#ff9800';

    return (
        <div>
            <h2>Informations Syst&egrave;me</h2>

            <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: statusColor + '22',
                border: `1px solid ${statusColor}`,
                marginBottom: '16px'
            }}>
                <strong style={{ color: statusColor }}>{buildInfo.status}</strong>
            </div>

            <div className="setting-item">
                <span className="setting-label">Build ID</span>
                <span>{buildInfo.manifest?.buildId || 'N/A'}</span>
            </div>
            <div className="setting-item">
                <span className="setting-label">Date du build</span>
                <span>{buildInfo.manifest?.buildTimestamp
                    ? new Date(buildInfo.manifest.buildTimestamp).toLocaleString()
                    : 'N/A'}</span>
            </div>
            <div className="setting-item">
                <span className="setting-label">Hash serveur (manifeste)</span>
                <code style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {buildInfo.manifest?.serverHash || 'N/A'}
                </code>
            </div>
            <div className="setting-item">
                <span className="setting-label">Hash serveur (runtime)</span>
                <code style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {buildInfo.runtime?.serverHash || 'N/A'}
                </code>
            </div>
            <div className="setting-item">
                <span className="setting-label">Fichiers serveur</span>
                <span>{buildInfo.runtime?.fileCount || 'N/A'}</span>
            </div>
            <div className="setting-item">
                <span className="setting-label">Serveur d&eacute;marr&eacute; le</span>
                <span>{buildInfo.serverStartedAt
                    ? new Date(buildInfo.serverStartedAt).toLocaleString()
                    : 'N/A'}</span>
            </div>

            <div style={{ marginTop: '16px' }}>
                <button
                    onClick={fetchBuildInfo}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        cursor: 'pointer',
                        backgroundColor: '#f5f5f5',
                        width: 'auto'
                    }}
                >
                    Rafra&icirc;chir
                </button>
            </div>
        </div>
    );
};

export default BuildInfoSection;
