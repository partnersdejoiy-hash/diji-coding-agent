#!/usr/bin/env bash
# Creates everything Diji's server needs in an Oracle Cloud Always Free account, from OCI Cloud Shell.
#   curl -fsSLo /tmp/p.sh https://raw.githubusercontent.com/partnersdejoiy-hash/diji-coding-agent/main/server/deploy/oci-provision.sh && bash /tmp/p.sh < /dev/null
#   (run it from a file: the oci CLI reads stdin, so "curl | bash" would swallow the script)
# Network (VCN, internet gateway, ports 22/80/443), then one Always Free VM: Ampere A1 (2 OCPU, 12 GB),
# falling back to E2.1.Micro when A1 capacity is unavailable. The VM installs Diji by itself on first boot.
# Safe to re-run: it reuses resources named diji-*.
set -euo pipefail

C="${OCI_TENANCY:?Run this in OCI Cloud Shell}"
CORS="${CORS_ORIGIN:-*}"
say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
q() { oci "$@" 2>/dev/null; }

find_one() { # resource-list-command... display-name
  local name="${@: -1}"; set -- "${@:1:$#-1}"
  q "$@" --compartment-id "$C" --all --query "data[?\"display-name\"=='$name' && \"lifecycle-state\"!='TERMINATED' && \"lifecycle-state\"!='TERMINATING'] | [0].id" --raw-output || true
}

say "Network"
VCN=$(find_one network vcn list diji-vcn)
if [ -z "$VCN" ] || [ "$VCN" = "null" ]; then
  VCN=$(oci network vcn create --compartment-id "$C" --cidr-blocks '["10.0.0.0/16"]' --display-name diji-vcn --dns-label dijivcn \
    --wait-for-state AVAILABLE --query data.id --raw-output)
fi
IGW=$(q network internet-gateway list --compartment-id "$C" --vcn-id "$VCN" --query "data[0].id" --raw-output || true)
if [ -z "$IGW" ] || [ "$IGW" = "null" ]; then
  IGW=$(oci network internet-gateway create --compartment-id "$C" --vcn-id "$VCN" --is-enabled true --display-name diji-igw \
    --wait-for-state AVAILABLE --query data.id --raw-output)
fi
RT=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"' --raw-output)
oci network route-table update --rt-id "$RT" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW\"}]" >/dev/null

port() { echo "{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"isStateless\":false,\"tcpOptions\":{\"destinationPortRange\":{\"min\":$1,\"max\":$1}}}"; }
INGRESS="[$(port 22),$(port 80),$(port 443)]"
EGRESS='[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]'
SL=$(q network security-list list --compartment-id "$C" --vcn-id "$VCN" --query "data[?\"display-name\"=='diji-sl'] | [0].id" --raw-output || true)
if [ -z "$SL" ] || [ "$SL" = "null" ]; then
  SL=$(oci network security-list create --compartment-id "$C" --vcn-id "$VCN" --display-name diji-sl \
    --ingress-security-rules "$INGRESS" --egress-security-rules "$EGRESS" --wait-for-state AVAILABLE --query data.id --raw-output)
else
  oci network security-list update --security-list-id "$SL" --ingress-security-rules "$INGRESS" --egress-security-rules "$EGRESS" --force >/dev/null
fi
SUB=$(q network subnet list --compartment-id "$C" --vcn-id "$VCN" --query "data[?\"display-name\"=='diji-subnet'] | [0].id" --raw-output || true)
if [ -z "$SUB" ] || [ "$SUB" = "null" ]; then
  SUB=$(oci network subnet create --compartment-id "$C" --vcn-id "$VCN" --cidr-block 10.0.0.0/24 --display-name diji-subnet --dns-label dijisub \
    --security-list-ids "[\"$SL\"]" --route-table-id "$RT" --wait-for-state AVAILABLE --query data.id --raw-output)
fi
echo "VCN, gateway, ports 22/80/443 and subnet are ready."

say "Access token"
TOKEN_FILE="$HOME/.diji-token"
[ -s "$TOKEN_FILE" ] || openssl rand -hex 16 > "$TOKEN_FILE"
TOKEN=$(cat "$TOKEN_FILE")

INST=$(find_one compute instance list diji-server)
if [ -z "$INST" ] || [ "$INST" = "null" ]; then
  [ -f "$HOME/.ssh/id_rsa.pub" ] || ssh-keygen -q -t rsa -b 4096 -N "" -f "$HOME/.ssh/id_rsa"
  UD=$(mktemp)
  cat > "$UD" <<EOF
#!/bin/bash
export HOME=/root USER=root DIJI_DIR=/opt/diji-coding-agent DIJI_SERVER_TOKEN=$TOKEN CORS_ORIGIN='$CORS'
curl -fsSL https://raw.githubusercontent.com/partnersdejoiy-hash/diji-coding-agent/main/server/deploy/oracle-setup.sh | bash > /var/log/diji-setup.log 2>&1
EOF
  ADS=$(oci iam availability-domain list --compartment-id "$C" --query "join(' ', data[*].name)" --raw-output)
  try_launch() { # shape shape-config image-os-arch-shape
    local shape=$1 cfg=$2 img
    img=$(oci compute image list --compartment-id "$C" --operating-system "Canonical Ubuntu" --operating-system-version "22.04" \
      --shape "$shape" --sort-by TIMECREATED --sort-order DESC --limit 1 --query 'data[0].id' --raw-output)
    for AD in $ADS; do
      echo "Trying $shape in $AD..."
      local args=(--compartment-id "$C" --availability-domain "$AD" --shape "$shape" --image-id "$img" --subnet-id "$SUB"
        --assign-public-ip true --display-name diji-server --user-data-file "$UD" --ssh-authorized-keys-file "$HOME/.ssh/id_rsa.pub"
        --wait-for-state RUNNING --max-wait-seconds 900 --query data.id --raw-output)
      [ -n "$cfg" ] && args+=(--shape-config "$cfg")
      if INST=$(oci compute instance launch "${args[@]}" 2>/tmp/diji-launch.err); then return 0; fi
      grep -o '"message": "[^"]*"' /tmp/diji-launch.err | head -1 || true
    done
    return 1
  }
  say "Creating the Always Free VM"
  try_launch VM.Standard.A1.Flex '{"ocpus":2,"memoryInGBs":12}' || try_launch VM.Standard.E2.1.Micro "" || {
    echo "Oracle has no free capacity right now in this region. Re-run this command in a few minutes; it resumes where it stopped."; exit 1; }
fi

IP=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."public-ip"' --raw-output)
SHAPE=$(oci compute instance get --instance-id "$INST" --query 'data.shape' --raw-output)
say "Done"
cat <<EOF
VM          : diji-server ($SHAPE), public IP $IP
Server URL  : https://${IP//./-}.sslip.io
Token       : $TOKEN
Diji installs itself in about 10 minutes. Then check: curl https://${IP//./-}.sslip.io/api/health
SSH (from this Cloud Shell): ssh ubuntu@$IP   then: sudo tail -f /var/log/diji-setup.log
EOF
