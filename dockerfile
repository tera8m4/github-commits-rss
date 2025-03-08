# Use an official Node.js runtime as a parent image
FROM jitesoft/node-yarn:latest

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the rest of the application files to the working directory
COPY . /usr/src/app/

# Install the application dependencies
RUN yarn

# Compile TypeScript to JavaScript
RUN yarn build

# Expose the port the app runs on
EXPOSE 3000

# Define environment variable
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "dist/app.js"]