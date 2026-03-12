import mysql from 'mysql2/promise';

export const db = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'ppos_user',
    password: process.env.MYSQL_PASSWORD || 'ppos_pass',
    database: process.env.MYSQL_DATABASE || 'printprice_os',
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
});
