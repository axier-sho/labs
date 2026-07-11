# DNS Exploration Notes
## Step 1: ChatGPT

- A domain name is easy for people to remember.
- Computers use IP addresses instead.
- A DNS resolver changes the name into the IP.
- Then the browser opens the page with HTTPS.

---

## Step 3: nslookup
```
nslookup google.com
```
- DNS server I asked: `129.105.49.1`
- IP for google.com: `142.251.32.14`

---

## Step 4: dig

**Commands:**
```
dig google.com
dig google.com +short
```

- `dig google.com` shows many info.
- `dig google.com +short` shows only the IP.

---

## Step 5: Record Types
```
dig google.com A
dig google.com AAAA
dig google.com MX
dig google.com NS
```

- A - the IPv4 address (short number).
- AAAA - the IPv6 address (long number).
- MX - the mail server for the domain.
- NS - the name servers in charge of the domain.

---

## Step 6: Different Resolvers
```
dig @1.1.1.1 google.com +short
dig @8.8.8.8 google.com +short
```

- Google DNS (8.8.8.8) gave `142.251.210.238`.
- My own DNS gave `142.251.32.14`.

Google has many server - many ip adress.
`1.1.1.1` went timeout for me.

---

## Step 7: Name vs IP in the Browser

Opened in my browser
```
https://142.251.32.14
```

The browser showed a security warning.

Asked ChatGPT:
```
HTTPS does two things:
1. It hides the traffic (encryption).
2. It checks that the certificate matches the name I asked for.

Google's certificate is made for "google.com," not for a number. So the name and the certificate do not match, and I get a warning — even though Google is safe.
```

---

## Step 8: curl
```
curl -I https://google.com
```

I saw `HTTP/2 301` and `location: https://www.google.com/`.

`dig` only finds the IP. `curl` actually talks to the server.

---

## Step 9: localhost

```
nslookup localhost
ping localhost
```

- `nslookup localhost` failed (the DNS server could not find it).
- `ping localhost` worked and showed `127.0.0.1`.

`localhost` always means my own computer.

---

## Reflection

### What does DNS do before HTTP starts?
DNS changes the domain name into an IP address.

### What is a DNS resolver?
It is the service that looks up a name and gives back the IP. 

### Why is a raw IP address not the same as typing the domain name?
HTTPS checks that the certificate matches the name I asked for. Google's certificate is made for "google.com," not for a number. So opening the raw IP does not match, and the browser shows a warning.

### What did ChatGPT explain well?
It explained what the difference between DNS and IP adresses in simple words with examples.

### What did you still need to verify by running commands yourself?
To check if I am talking to the right server/portt.
