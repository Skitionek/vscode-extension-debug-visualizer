import os

# Directory containing the test files
test_files_dir = os.path.join(os.path.dirname(__file__), 'test_files')

filename_to_content = {}

for filename in os.listdir(test_files_dir):
    file_path = os.path.join(test_files_dir, filename)
    if os.path.isfile(file_path):
        content = filename_to_content.setdefault(filename, {})
        with open(file_path, 'rb') as file:
            content['binary'] = file.read()

        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content['text'] = file.read()
        except UnicodeDecodeError:
            content['text'] = None

print("Put breakpoint here to inspect `filename_to_content` in visual debugger")