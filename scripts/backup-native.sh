#!/bin/bash

# Directory for backup
BACKUP_DIR="native-backup"
IOS_DIR="ios"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup files
backup() {
    echo "Backing up native files..."
    cp $IOS_DIR/SecureWallet.h $BACKUP_DIR/
    cp $IOS_DIR/SecureWallet.m $BACKUP_DIR/
    cp $IOS_DIR/SecureWallet.podspec $BACKUP_DIR/
    echo "Backup complete"
}

# Restore files
restore() {
    echo "Restoring native files..."
    cp $BACKUP_DIR/SecureWallet.h $IOS_DIR/
    cp $BACKUP_DIR/SecureWallet.m $IOS_DIR/
    cp $BACKUP_DIR/SecureWallet.podspec $IOS_DIR/
    echo "Restore complete"
}

# Check command line argument
if [ "$1" = "backup" ]; then
    backup
elif [ "$1" = "restore" ]; then
    restore
else
    echo "Usage: $0 [backup|restore]"
    exit 1
fi 